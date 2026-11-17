import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { DtmClient } from '../saga/dtm.client';
import { transactionDurationHistogramProvider } from '../metrics/metrics.constants';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem])],
  controllers: [OrderController],
  providers: [
    OrderService,
    DtmClient,
    transactionDurationHistogramProvider,
  ],
  exports: [OrderService],
})
export class OrderModule {}
