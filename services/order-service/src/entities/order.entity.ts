import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { OrderItem } from './order-item.entity';

@Entity('orders')
export class Order {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 12, scale: 2 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status: string; // 'PENDING' | 'SUCCESS' | 'FAILED'

  @Column({ name: 'orchestrator_type', type: 'varchar', length: 32 })
  orchestratorType: string; // 'DTM' | 'Custom_Saga'

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];
}
