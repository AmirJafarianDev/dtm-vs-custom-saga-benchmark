import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { DeductPaymentDto, CompensatePaymentDto } from './dto/payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('wallet/:userId')
  @ApiOperation({ summary: 'Get current user wallet balance' })
  @ApiParam({ name: 'userId', description: 'User identifier (1 for Rich, 2 for Zero Balance)', example: '1' })
  @ApiResponse({ status: 200, description: 'Wallet returned successfully' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWallet(@Param('userId') userId: string) {
    return this.paymentService.getWallet(userId);
  }

  @Post('deduct')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atomically deduct payment amount from user wallet' })
  @ApiBody({ type: DeductPaymentDto })
  @ApiResponse({ status: 200, description: 'Payment deducted successfully' })
  @ApiResponse({ status: 409, description: 'Insufficient wallet balance' })
  async deduct(
    @Body() body: DeductPaymentDto,
    @Query() query: { orderId?: string; userId?: string; amount?: string },
  ) {
    const orderId = body?.orderId || query?.orderId;
    const userId = body?.userId || query?.userId;
    const amount = Number(body?.amount ?? query?.amount ?? 0);

    return this.paymentService.deduct(orderId, userId, amount);
  }

  @Post('compensate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compensate (refund) deducted amount upon Saga rollback' })
  @ApiBody({ type: CompensatePaymentDto })
  @ApiResponse({ status: 200, description: 'Payment refunded successfully' })
  async compensate(
    @Body() body: CompensatePaymentDto,
    @Query() query: { orderId?: string; userId?: string; amount?: string },
  ) {
    const orderId = body?.orderId || query?.orderId;
    const userId = body?.userId || query?.userId;
    const amount = Number(body?.amount ?? query?.amount ?? 0);

    return this.paymentService.compensate(orderId, userId, amount);
  }
}
