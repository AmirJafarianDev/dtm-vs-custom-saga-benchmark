import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { DtmClient } from '../saga/dtm.client';
import { CustomSagaOrchestrator } from '../saga/custom-saga.orchestrator';
import { TRANSACTION_DURATION_METRIC } from '../metrics/metrics.constants';

export interface CheckoutItemInput {
  productId: string;
  quantity: number;
}

export interface CheckoutPayload {
  userId: string;
  items: CheckoutItemInput[];
}

interface SagaContext {
  orderId: string;
  userId: string;
  items: (CheckoutItemInput & { price: number })[];
  totalAmount: number;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly productServiceUrl: string;
  private readonly paymentServiceUrl: string;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    private readonly config: ConfigService,
    private readonly dtmClient: DtmClient,
    @InjectMetric(TRANSACTION_DURATION_METRIC)
    private readonly durationHistogram: Histogram<string>,
  ) {
    this.productServiceUrl = this.config.get<string>('PRODUCT_SERVICE_URL', 'http://localhost:3001');
    this.paymentServiceUrl = this.config.get<string>('PAYMENT_SERVICE_URL', 'http://localhost:3003');
  }

  async getOrder(id: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }
    return order;
  }

  async updateOrderStatus(id: string, status: string, failureReason?: string): Promise<Order> {
    await this.orderRepo.update(id, {
      status,
      failureReason: failureReason || null,
    });
    return this.getOrder(id);
  }

  /**
   * Helper to fetch prices and calculate total amount
   */
  private async prepareOrderItems(items: CheckoutItemInput[]): Promise<{
    itemsWithPrice: (CheckoutItemInput & { price: number })[];
    totalAmount: number;
  }> {
    const itemsWithPrice: (CheckoutItemInput & { price: number })[] = [];
    let totalAmount = 0;

    for (const item of items) {
      const response = await axios.get(`${this.productServiceUrl}/products/${item.productId}`, {
        timeout: 60000,
      });
      const price = Number(response.data.price);
      itemsWithPrice.push({
        productId: item.productId,
        quantity: item.quantity,
        price,
      });
      totalAmount += price * item.quantity;
    }

    return { itemsWithPrice, totalAmount };
  }

  /**
   * Method A: DTM-based Distributed Transaction (Saga)
   */
  async checkoutWithDtm(payload: CheckoutPayload) {
    const stopTimer = this.durationHistogram.startTimer({
      orchestrator_type: 'DTM',
    });

    const orderId = uuidv4();
    try {
      // Step 1: Get product prices & calculate total amount
      const { itemsWithPrice, totalAmount } = await this.prepareOrderItems(payload.items);

      // Step 2: Create initial order in PENDING status
      const order = this.orderRepo.create({
        id: orderId,
        userId: payload.userId,
        totalAmount,
        status: 'PENDING',
        orchestratorType: 'DTM',
      });
      await this.orderRepo.save(order);

      const orderItems = itemsWithPrice.map((item) =>
        this.orderItemRepo.create({
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        }),
      );
      await this.orderItemRepo.save(orderItems);

      // Build DTM Saga steps
      // 1) Product deduction & compensation steps
      const dtmSteps = [];
      const dtmPayloads = [];

      for (const item of itemsWithPrice) {
        dtmSteps.push({
          action: `${this.productServiceUrl}/products/deduct`,
          compensate: `${this.productServiceUrl}/products/compensate`,
        });
        dtmPayloads.push({
          orderId,
          productId: item.productId,
          quantity: item.quantity,
        });
      }

      // 2) Payment deduction & compensation step
      dtmSteps.push({
        action: `${this.paymentServiceUrl}/payments/deduct`,
        compensate: `${this.paymentServiceUrl}/payments/compensate`,
      });
      dtmPayloads.push({
        orderId,
        userId: payload.userId,
        amount: totalAmount,
      });

      // Submit Saga to DTM Server
      const dtmResult = await this.dtmClient.submitSaga(dtmSteps, dtmPayloads);

      if (dtmResult.success) {
        await this.orderRepo.update(orderId, { status: 'SUCCESS' });
        stopTimer({ status: 'SUCCESS' });

        return {
          success: true,
          status: 'SUCCESS',
          orderId,
          totalAmount,
          orchestrator: 'DTM',
          gid: dtmResult.gid,
        };
      } else {
        // DTM triggered compensation for product stock
        await this.orderRepo.update(orderId, {
          status: 'FAILED',
          failureReason: dtmResult.message || 'Payment failed or DTM aborted',
        });
        stopTimer({ status: 'COMPENSATED' });

        return {
          success: false,
          status: 'FAILED',
          orderId,
          totalAmount,
          orchestrator: 'DTM',
          failureReason: dtmResult.message,
          gid: dtmResult.gid,
        };
      }
    } catch (error) {
      this.logger.error(`[DTM] Checkout error: ${error.message}`, error.stack);
      await this.orderRepo.update(orderId, {
        status: 'FAILED',
        failureReason: error.message,
      });
      stopTimer({ status: 'COMPENSATED' });

      return {
        success: false,
        status: 'FAILED',
        orderId,
        orchestrator: 'DTM',
        failureReason: error.message,
      };
    }
  }

  /**
   * Method B: Custom NestJS Saga Orchestrator
   */
  async checkoutWithCustomSaga(payload: CheckoutPayload) {
    const stopTimer = this.durationHistogram.startTimer({
      orchestrator_type: 'Custom_Saga',
    });

    const orderId = uuidv4();
    try {
      // Step 1: Get product prices
      const { itemsWithPrice, totalAmount } = await this.prepareOrderItems(payload.items);

      const context: SagaContext = {
        orderId,
        userId: payload.userId,
        items: itemsWithPrice,
        totalAmount,
      };

      const orchestrator = new CustomSagaOrchestrator<SagaContext>();

      // Register Step 1: Order Creation (Action: save PENDING, Compensate: update to FAILED)
      orchestrator.addStep({
        name: 'CreateOrder',
        execute: async (ctx) => {
          const order = this.orderRepo.create({
            id: ctx.orderId,
            userId: ctx.userId,
            totalAmount: ctx.totalAmount,
            status: 'PENDING',
            orchestratorType: 'Custom_Saga',
          });
          await this.orderRepo.save(order);

          const orderItems = ctx.items.map((item) =>
            this.orderItemRepo.create({
              orderId: ctx.orderId,
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
            }),
          );
          await this.orderItemRepo.save(orderItems);
        },
        compensate: async (ctx) => {
          await this.orderRepo.update(ctx.orderId, {
            status: 'FAILED',
            failureReason: 'Compensated by Custom Saga Orchestrator',
          });
        },
      });

      // Register Step 2: Product Inventory Deductions
      for (const item of itemsWithPrice) {
        orchestrator.addStep({
          name: `DeductStock_${item.productId}`,
          execute: async (ctx) => {
            try {
              const resp = await axios.post(
                `${this.productServiceUrl}/products/deduct`,
                {
                  orderId: ctx.orderId,
                  productId: item.productId,
                  quantity: item.quantity,
                },
                { timeout: 60000 },
              );
              if (resp.data?.dtm_result === 'FAILURE') {
                throw new Error(resp.data?.message || 'Inventory deduction failed');
              }
            } catch (err) {
              const msg = err.response?.data?.message || err.message;
              throw new Error(msg || 'Inventory deduction failed');
            }
          },
          compensate: async (ctx) => {
            await axios.post(
              `${this.productServiceUrl}/products/compensate`,
              {
                orderId: ctx.orderId,
                productId: item.productId,
                quantity: item.quantity,
              },
              { timeout: 60000 },
            );
          },
        });
      }

      // Register Step 3: Payment Deduction (Action: deduct wallet, Compensate: refund wallet)
      orchestrator.addStep({
        name: 'DeductPayment',
        execute: async (ctx) => {
          try {
            const resp = await axios.post(
              `${this.paymentServiceUrl}/payments/deduct`,
              {
                orderId: ctx.orderId,
                userId: ctx.userId,
                amount: ctx.totalAmount,
              },
              { timeout: 60000 },
            );
            if (resp.data?.dtm_result === 'FAILURE') {
              throw new Error(resp.data?.message || 'Payment deduction failed');
            }
          } catch (err) {
            const msg = err.response?.data?.message || err.message;
            throw new Error(msg || 'Payment deduction failed');
          }
        },
        compensate: async (ctx) => {
          await axios.post(
            `${this.paymentServiceUrl}/payments/compensate`,
            {
              orderId: ctx.orderId,
              userId: ctx.userId,
              amount: ctx.totalAmount,
            },
            { timeout: 60000 },
          );
        },
      });

      // Execute Saga pipeline
      const sagaResult = await orchestrator.execute(context);

      if (sagaResult.success) {
        await this.orderRepo.update(orderId, { status: 'SUCCESS' });
        stopTimer({ status: 'SUCCESS' });

        return {
          success: true,
          status: 'SUCCESS',
          orderId,
          totalAmount,
          orchestrator: 'Custom_Saga',
          executedSteps: sagaResult.executedSteps,
        };
      } else {
        // Rollback compensations were executed automatically by orchestrator
        const failReason = sagaResult.error?.message || 'Custom Saga transaction failed';
        await this.orderRepo.update(orderId, {
          status: 'FAILED',
          failureReason: failReason,
        });
        stopTimer({ status: 'COMPENSATED' });

        return {
          success: false,
          status: 'FAILED',
          orderId,
          totalAmount,
          orchestrator: 'Custom_Saga',
          failedStep: sagaResult.failedStep,
          failureReason: failReason,
        };
      }
    } catch (error) {
      this.logger.error(`[CustomSaga] Unexpected error: ${error.message}`, error.stack);
      await this.orderRepo.update(orderId, {
        status: 'FAILED',
        failureReason: error.message,
      });
      stopTimer({ status: 'COMPENSATED' });

      return {
        success: false,
        status: 'FAILED',
        orderId,
        orchestrator: 'Custom_Saga',
        failureReason: error.message,
      };
    }
  }
}
