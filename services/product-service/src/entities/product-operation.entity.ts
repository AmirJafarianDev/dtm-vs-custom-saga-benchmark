import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('product_operations')
@Unique(['orderId', 'productId', 'operationType'])
export class ProductOperation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'order_id', type: 'varchar', length: 64 })
  orderId: string;

  @Column({ name: 'product_id', type: 'varchar', length: 64 })
  productId: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'operation_type', type: 'varchar', length: 32 })
  operationType: string; // 'DEDUCT' or 'COMPENSATE'

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
