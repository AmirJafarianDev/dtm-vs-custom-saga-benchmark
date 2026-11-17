import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckoutItemDto {
  @ApiProperty({
    description: 'Product identifier to purchase',
    example: '1',
  })
  productId: string;

  @ApiProperty({
    description: 'Quantity of product to purchase',
    example: 1,
    default: 1,
  })
  quantity: number;
}

export class CheckoutDto {
  @ApiProperty({
    description: 'User ID. Use "1" for Happy Path ($100M balance) or "2" for Compensation Path ($0 balance)',
    example: '1',
  })
  userId: string;

  @ApiProperty({
    description: 'List of order items to checkout',
    type: [CheckoutItemDto],
    example: [{ productId: '1', quantity: 1 }],
  })
  items: CheckoutItemDto[];
}

export enum OrchestratorTypeEnum {
  DTM = 'DTM',
  Custom_Saga = 'Custom_Saga',
}

export class DynamicCheckoutDto extends CheckoutDto {
  @ApiPropertyOptional({
    description: 'Orchestrator engine: DTM (Method A) or Custom_Saga (Method B)',
    enum: OrchestratorTypeEnum,
    example: OrchestratorTypeEnum.Custom_Saga,
    default: OrchestratorTypeEnum.Custom_Saga,
  })
  orchestratorType?: 'DTM' | 'Custom_Saga';
}

export class FailOrderDto {
  @ApiPropertyOptional({
    description: 'Reason for marking order as failed / compensated',
    example: 'Insufficient wallet balance',
  })
  reason?: string;
}
