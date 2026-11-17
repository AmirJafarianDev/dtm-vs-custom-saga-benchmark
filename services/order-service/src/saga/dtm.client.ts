import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface DtmStep {
  action: string;
  compensate: string;
}

export interface DtmSagaPayload {
  gid?: string;
  trans_type: 'saga';
  steps: DtmStep[];
  payloads: string[];
}

@Injectable()
export class DtmClient {
  private readonly logger = new Logger(DtmClient.name);
  private readonly dtmServerUrl: string;

  constructor(private readonly config: ConfigService) {
    this.dtmServerUrl = this.config.get<string>('DTM_SERVER_URL', 'http://localhost:36789');
  }

  generateGid(): string {
    return `saga_${uuidv4().replace(/-/g, '')}`;
  }

  async queryTransaction(gid: string): Promise<{ status: string; rollbackReason?: string }> {
    try {
      const response = await axios.get(`${this.dtmServerUrl}/api/dtmsvr/query`, {
        params: { gid },
        timeout: 10000,
      });
      return {
        status: response.data?.transaction?.status || 'unknown',
        rollbackReason: response.data?.transaction?.rollback_reason || '',
      };
    } catch (error) {
      return { status: 'unknown' };
    }
  }

  async submitSaga(steps: DtmStep[], payloads: Record<string, any>[]): Promise<{ success: boolean; gid: string; message?: string }> {
    const gid = this.generateGid();
    const payload: DtmSagaPayload = {
      gid,
      trans_type: 'saga',
      steps,
      payloads: payloads.map((p) => JSON.stringify(p)),
    };

    try {
      this.logger.debug(`[DTM] Submitting saga transaction with GID: ${gid} to ${this.dtmServerUrl}/api/dtmsvr/submit`);
      const response = await axios.post(`${this.dtmServerUrl}/api/dtmsvr/submit`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      });

      if (response.data && response.data.dtm_result === 'FAILURE') {
        this.logger.warn(`[DTM] Saga ${gid} submit rejected: ${response.data.message}`);
        return { success: false, gid, message: response.data.message || 'DTM transaction failed' };
      }

      // Poll DTM query endpoint to ensure final status (succeed / failed)
      let finalStatus = 'submitted';
      let rollbackReason = '';

      for (let attempt = 0; attempt < 50; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        const q = await this.queryTransaction(gid);
        finalStatus = q.status;
        if (q.rollbackReason) rollbackReason = q.rollbackReason;

        if (finalStatus === 'succeed' || finalStatus === 'failed') {
          break;
        }
      }

      if (finalStatus === 'failed') {
        this.logger.warn(`[DTM] Saga ${gid} aborted and compensated: ${rollbackReason}`);
        return {
          success: false,
          gid,
          message: rollbackReason || 'DTM transaction aborted and compensated',
        };
      }

      return { success: true, gid };
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      this.logger.warn(`[DTM] Saga ${gid} submission failed or aborted: ${errorMsg}`);
      return { success: false, gid, message: errorMsg };
    }
  }
}
