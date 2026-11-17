import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, VersionColumn } from 'typeorm';

@Entity('wallets')
export class Wallet {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  balance: number;

  @VersionColumn({ default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
