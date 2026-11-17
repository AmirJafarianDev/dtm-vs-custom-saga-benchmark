import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { CheckoutDto, DynamicCheckoutDto, FailOrderDto, OrchestratorTypeEnum } from './dto/order.dto';

@ApiTags('Orders')
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get order details and items by Order ID' })
  @ApiParam({ name: 'id', description: 'Order UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({ status: 200, description: 'Order details returned successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrder(@Param('id') id: string) {
    return this.orderService.getOrder(id);
  }

  /**
   * Method A: Trigger Saga via DTM (Distributed Transaction Manager)
   */
  @Post('checkout/dtm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Method A: Checkout using external DTM server (yedf/dtm)',
    description: 'Submits a 2-step distributed transaction (Deduct Stock -> Deduct Payment) to DTM. If payment fails, DTM automatically invokes compensation on product stock.',
  })
  @ApiBody({
    type: CheckoutDto,
    examples: {
      happyPath: {
        summary: 'Happy Path: User 1 (Sufficient Balance)',
        description: 'User 1 has $100M balance. Transaction completes with SUCCESS.',
        value: {
          userId: '1',
          items: [{ productId: '1', quantity: 1 }],
        },
      },
      compensationPath: {
        summary: 'Compensation Path: User 2 (Insufficient Balance)',
        description: 'User 2 has $0 balance. Payment fails and DTM rolls back product stock to ensure consistency.',
        value: {
          userId: '2',
          items: [{ productId: '1', quantity: 1 }],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Transaction processed (returns status SUCCESS or FAILED/COMPENSATED)' })
  async checkoutDtm(@Body() payload: CheckoutDto) {
    return this.orderService.checkoutWithDtm(payload);
  }

  /**
   * Method B: Trigger Saga via Custom NestJS Saga Orchestrator
   */
  @Post('checkout/custom')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Method B: Checkout using Custom In-Process Saga Orchestrator',
    description: 'Executes distributed Saga in-process using LIFO reverse rollback. Yields sub-10s P95 latencies and 100% compensation consistency without external coordinator network hops.',
  })
  @ApiBody({
    type: CheckoutDto,
    examples: {
      happyPath: {
        summary: 'Happy Path: User 1 (Sufficient Balance)',
        description: 'User 1 has $100M balance. Transaction completes with SUCCESS.',
        value: {
          userId: '1',
          items: [{ productId: '1', quantity: 1 }],
        },
      },
      compensationPath: {
        summary: 'Compensation Path: User 2 (Insufficient Balance)',
        description: 'User 2 has $0 balance. Payment fails and Custom Saga executes reverse LIFO compensation on product stock.',
        value: {
          userId: '2',
          items: [{ productId: '1', quantity: 1 }],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Transaction processed (returns status SUCCESS or FAILED/COMPENSATED)' })
  async checkoutCustom(@Body() payload: CheckoutDto) {
    return this.orderService.checkoutWithCustomSaga(payload);
  }

  /**
   * Dynamic checkout endpoint: supports choosing orchestrator via body or query parameter
   */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dynamic Checkout: Switch between DTM and Custom_Saga dynamically',
    description: 'Accepts orchestratorType in body or ?orchestrator= query parameter to toggle between Method A and Method B dynamically.',
  })
  @ApiQuery({
    name: 'orchestrator',
    enum: OrchestratorTypeEnum,
    required: false,
    description: 'Query parameter override for orchestrator type',
  })
  @ApiBody({
    type: DynamicCheckoutDto,
    examples: {
      customSagaHappy: {
        summary: 'Custom Saga - Happy Path',
        value: {
          userId: '1',
          items: [{ productId: '1', quantity: 1 }],
          orchestratorType: 'Custom_Saga',
        },
      },
      dtmHappy: {
        summary: 'DTM - Happy Path',
        value: {
          userId: '1',
          items: [{ productId: '1', quantity: 1 }],
          orchestratorType: 'DTM',
        },
      },
      customSagaCompensation: {
        summary: 'Custom Saga - Compensation Path',
        value: {
          userId: '2',
          items: [{ productId: '1', quantity: 1 }],
          orchestratorType: 'Custom_Saga',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Order processed by selected orchestrator' })
  async checkout(
    @Body() payload: DynamicCheckoutDto,
    @Query('orchestrator') orchestratorQuery?: 'DTM' | 'Custom_Saga',
  ) {
    const orchestrator = payload.orchestratorType || orchestratorQuery || 'Custom_Saga';
    if (orchestrator === 'DTM') {
      return this.orderService.checkoutWithDtm(payload);
    }
    return this.orderService.checkoutWithCustomSaga(payload);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm order status to SUCCESS' })
  @ApiParam({ name: 'id', description: 'Order UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({ status: 200, description: 'Order status confirmed' })
  async confirmOrder(@Param('id') id: string) {
    return this.orderService.updateOrderStatus(id, 'SUCCESS');
  }

  @Post(':id/fail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark order status as FAILED with optional reason' })
  @ApiParam({ name: 'id', description: 'Order UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiBody({ type: FailOrderDto })
  @ApiResponse({ status: 200, description: 'Order status marked as FAILED' })
  async failOrder(@Param('id') id: string, @Body() body?: FailOrderDto) {
    return this.orderService.updateOrderStatus(id, 'FAILED', body?.reason);
  }
}
