import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Wallet } from '../entities/wallet.entity';
import { PaymentTransaction } from '../entities/payment-transaction.entity';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    private readonly dataSource: DataSource,
  ) {}

  async getWallet(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepo.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException(`Wallet for user ${userId} not found`);
    }
    return {
      ...wallet,
      balance: Number(wallet.balance),
    };
  }

  async deduct(orderId: string, userId: string, amount: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Check idempotency
      const existingTx = await queryRunner.manager.findOne(PaymentTransaction, {
        where: { orderId, type: 'DEDUCT' },
      });

      if (existingTx) {
        await queryRunner.commitTransaction();
        if (existingTx.status === 'SUCCESS') {
          return { dtm_result: 'SUCCESS', message: 'Payment already deducted (idempotent)' };
        } else {
          throw new ConflictException({
            dtm_result: 'FAILURE',
            message: 'Previous payment attempt failed',
          });
        }
      }

      // 2. Atomic balance deduction
      const updateResult = await queryRunner.manager.query(
        `UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2 AND balance >= $1 RETURNING balance`,
        [amount, userId],
      );

      // In Postgres with TypeORM, query() on UPDATE ... RETURNING returns [[{balance}], rowCount]
      const rows = Array.isArray(updateResult) && Array.isArray(updateResult[0])
        ? updateResult[0]
        : (Array.isArray(updateResult) ? updateResult : []);

      if (!rows || rows.length === 0) {
        // Record failure for audit
        const failTx = queryRunner.manager.create(PaymentTransaction, {
          orderId,
          userId,
          amount,
          type: 'DEDUCT',
          status: 'FAILED',
        });
        await queryRunner.manager.save(failTx);
        await queryRunner.commitTransaction();

        this.logger.warn(`Payment failed: Insufficient balance for user ${userId}, required: ${amount}`);
        throw new ConflictException({
          dtm_result: 'FAILURE',
          message: 'Insufficient wallet balance',
        });
      }

      // 3. Record successful transaction
      const successTx = queryRunner.manager.create(PaymentTransaction, {
        orderId,
        userId,
        amount,
        type: 'DEDUCT',
        status: 'SUCCESS',
      });
      await queryRunner.manager.save(successTx);

      await queryRunner.commitTransaction();
      return {
        dtm_result: 'SUCCESS',
        message: 'Payment deducted successfully',
        remainingBalance: Number(rows[0].balance),
      };
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      if (err instanceof ConflictException) {
        throw err;
      }
      this.logger.error(`Error in deduct payment: ${err.message}`, err.stack);
      throw new ConflictException({
        dtm_result: 'FAILURE',
        message: err.message || 'Payment deduction error',
      });
    } finally {
      await queryRunner.release();
    }
  }

  async compensate(orderId: string, userId: string, amount: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Check idempotency
      const existingComp = await queryRunner.manager.findOne(PaymentTransaction, {
        where: { orderId, type: 'COMPENSATE' },
      });

      if (existingComp) {
        await queryRunner.commitTransaction();
        return { dtm_result: 'SUCCESS', message: 'Payment already refunded (idempotent)' };
      }

      // 2. Check if money was actually deducted
      const existingDeduct = await queryRunner.manager.findOne(PaymentTransaction, {
        where: { orderId, type: 'DEDUCT', status: 'SUCCESS' },
      });

      if (!existingDeduct) {
        // No money was deducted, no refund needed
        await queryRunner.commitTransaction();
        return { dtm_result: 'SUCCESS', message: 'No successful payment found to refund' };
      }

      // 3. Refund balance
      await queryRunner.manager.query(
        `UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2`,
        [amount, userId],
      );

      // 4. Record compensation transaction
      const compTx = queryRunner.manager.create(PaymentTransaction, {
        orderId,
        userId,
        amount,
        type: 'COMPENSATE',
        status: 'SUCCESS',
      });
      await queryRunner.manager.save(compTx);

      await queryRunner.commitTransaction();
      this.logger.log(`Compensated payment for order ${orderId}, user ${userId}, amount ${amount}`);
      return {
        dtm_result: 'SUCCESS',
        message: 'Payment refunded successfully',
      };
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(`Error compensating payment: ${err.message}`, err.stack);
      return { dtm_result: 'SUCCESS', message: `Compensate error handled: ${err.message}` };
    } finally {
      await queryRunner.release();
    }
  }
}
