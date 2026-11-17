import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('payment_transactions')
@Unique(['orderId', 'type'])
export class PaymentTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'order_id', type: 'varchar', length: 64 })
  orderId: string;

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 32 })
  type: string; // 'DEDUCT' or 'COMPENSATE'

  @Column({ type: 'varchar', length: 32 })
  status: string; // 'SUCCESS' or 'FAILED'

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
