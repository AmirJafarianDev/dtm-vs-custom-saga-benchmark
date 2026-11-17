import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductOperation } from '../entities/product-operation.entity';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductOperation)
    private readonly operationRepo: Repository<ProductOperation>,
    private readonly dataSource: DataSource,
  ) {}

  async getProduct(id: string): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return {
      ...product,
      price: Number(product.price),
    };
  }

  async deductStock(orderId: string, productId: string, quantity: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Check idempotency
      const existingOp = await queryRunner.manager.findOne(ProductOperation, {
        where: { orderId, productId, operationType: 'DEDUCT' },
      });

      if (existingOp) {
        await queryRunner.commitTransaction();
        return { dtm_result: 'SUCCESS', message: 'Stock already deducted (idempotent)' };
      }

      // 2. Atomic stock decrement
      const updateResult = await queryRunner.manager.query(
        `UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND stock >= $1 RETURNING stock`,
        [quantity, productId],
      );

      // In Postgres with TypeORM, query() on UPDATE ... RETURNING returns [[{stock}], rowCount]
      const rows = Array.isArray(updateResult) && Array.isArray(updateResult[0])
        ? updateResult[0]
        : (Array.isArray(updateResult) ? updateResult : []);

      if (!rows || rows.length === 0) {
        await queryRunner.rollbackTransaction();
        this.logger.warn(`Deduct failed: Insufficient stock for product ${productId}, requested: ${quantity}`);
        throw new ConflictException({
          dtm_result: 'FAILURE',
          message: 'Insufficient stock or product not found',
        });
      }

      // 3. Record operation for idempotency & auditing
      const op = queryRunner.manager.create(ProductOperation, {
        orderId,
        productId,
        quantity,
        operationType: 'DEDUCT',
      });
      await queryRunner.manager.save(op);

      await queryRunner.commitTransaction();
      return {
        dtm_result: 'SUCCESS',
        message: 'Stock deducted successfully',
        remainingStock: Number(rows[0].stock),
      };
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      if (err instanceof ConflictException) {
        throw err;
      }
      this.logger.error(`Error deducting stock: ${err.message}`, err.stack);
      throw new ConflictException({
        dtm_result: 'FAILURE',
        message: err.message || 'Error deducting stock',
      });
    } finally {
      await queryRunner.release();
    }
  }

  async compensateStock(orderId: string, productId: string, quantity: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Check idempotency for compensation
      const existingComp = await queryRunner.manager.findOne(ProductOperation, {
        where: { orderId, productId, operationType: 'COMPENSATE' },
      });

      if (existingComp) {
        await queryRunner.commitTransaction();
        return { dtm_result: 'SUCCESS', message: 'Stock already compensated (idempotent)' };
      }

      // 2. Check if deduction actually took place
      const existingDeduct = await queryRunner.manager.findOne(ProductOperation, {
        where: { orderId, productId, operationType: 'DEDUCT' },
      });

      if (!existingDeduct) {
        // Nothing was deducted, nothing to compensate. Still return SUCCESS for DTM / Saga
        await queryRunner.commitTransaction();
        return { dtm_result: 'SUCCESS', message: 'No deduction found to compensate' };
      }

      // 3. Restore inventory
      await queryRunner.manager.query(
        `UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2`,
        [quantity, productId],
      );

      // 4. Record compensation operation
      const compOp = queryRunner.manager.create(ProductOperation, {
        orderId,
        productId,
        quantity,
        operationType: 'COMPENSATE',
      });
      await queryRunner.manager.save(compOp);

      await queryRunner.commitTransaction();
      this.logger.log(`Compensated stock for order ${orderId}, product ${productId}, quantity ${quantity}`);
      return {
        dtm_result: 'SUCCESS',
        message: 'Stock restored successfully',
      };
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(`Error compensating stock: ${err.message}`, err.stack);
      // DTM requires compensation to eventually succeed (or 200) to complete rollback
      return { dtm_result: 'SUCCESS', message: `Compensate error handled: ${err.message}` };
    } finally {
      await queryRunner.release();
    }
  }
}
