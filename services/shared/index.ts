export enum OrchestratorType {
  DTM = 'DTM',
  CUSTOM_SAGA = 'Custom_Saga',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export interface OrderItemDto {
  productId: string;
  quantity: number;
  price?: number;
}

export interface CreateOrderDto {
  userId: string;
  items: OrderItemDto[];
}

export interface DeductStockDto {
  orderId: string;
  productId: string;
  quantity: number;
}

export interface CompensateStockDto {
  orderId: string;
  productId: string;
  quantity: number;
}

export interface DeductPaymentDto {
  orderId: string;
  userId: string;
  amount: number;
}

export interface CompensatePaymentDto {
  orderId: string;
  userId: string;
  amount: number;
}

export interface CheckoutRequestDto {
  userId: string;
  items: {
    productId: string;
    quantity: number;
  }[];
}

export interface DtmResponse {
  dtm_result: 'SUCCESS' | 'FAILURE';
  message?: string;
}
