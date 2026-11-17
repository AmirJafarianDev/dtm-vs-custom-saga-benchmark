import { ApiProperty } from '@nestjs/swagger';

export class DeductStockDto {
  @ApiProperty({
    description: 'Unique order identifier for tracking and idempotency',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  orderId?: string;

  @ApiProperty({
    description: 'Product identifier',
    example: '1',
    required: false,
  })
  productId?: string;

  @ApiProperty({
    description: 'Quantity to deduct from product stock',
    example: 1,
    required: false,
    default: 1,
  })
  quantity?: number;
}

export class CompensateStockDto {
  @ApiProperty({
    description: 'Unique order identifier for tracking and idempotency',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  orderId?: string;

  @ApiProperty({
    description: 'Product identifier',
    example: '1',
    required: false,
  })
  productId?: string;

  @ApiProperty({
    description: 'Quantity to restore back to product stock',
    example: 1,
    required: false,
    default: 1,
  })
  quantity?: number;
}
