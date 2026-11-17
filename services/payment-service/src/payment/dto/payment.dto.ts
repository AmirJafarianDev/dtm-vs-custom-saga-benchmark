import { ApiProperty } from '@nestjs/swagger';

export class DeductPaymentDto {
  @ApiProperty({
    description: 'Unique order identifier for tracking and idempotency',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  orderId?: string;

  @ApiProperty({
    description: 'User identifier. User 1 has $100M (Happy Path), User 2 has $0 (Compensation Path)',
    example: '1',
    required: false,
  })
  userId?: string;

  @ApiProperty({
    description: 'Amount to deduct from user wallet balance',
    example: 1000,
    required: false,
    default: 0,
  })
  amount?: number;
}

export class CompensatePaymentDto {
  @ApiProperty({
    description: 'Unique order identifier for tracking and idempotency',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  orderId?: string;

  @ApiProperty({
    description: 'User identifier to refund',
    example: '1',
    required: false,
  })
  userId?: string;

  @ApiProperty({
    description: 'Amount to refund back to user wallet',
    example: 1000,
    required: false,
    default: 0,
  })
  amount?: number;
}
