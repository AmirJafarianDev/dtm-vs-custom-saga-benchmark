import { Logger } from '@nestjs/common';

export interface SagaStep<TContext> {
  name: string;
  execute: (context: TContext) => Promise<any>;
  compensate: (context: TContext) => Promise<any>;
}

export interface SagaExecutionResult<TContext> {
  success: boolean;
  context: TContext;
  executedSteps: string[];
  failedStep?: string;
  error?: Error;
}

export class CustomSagaOrchestrator<TContext> {
  private readonly logger = new Logger(CustomSagaOrchestrator.name);
  private readonly steps: SagaStep<TContext>[] = [];

  addStep(step: SagaStep<TContext>): this {
    this.steps.push(step);
    return this;
  }

  async execute(context: TContext): Promise<SagaExecutionResult<TContext>> {
    const executedSteps: SagaStep<TContext>[] = [];

    for (const step of this.steps) {
      try {
        this.logger.debug(`[CustomSaga] Executing step: ${step.name}`);
        await step.execute(context);
        executedSteps.push(step);
      } catch (error) {
        this.logger.warn(`[CustomSaga] Step '${step.name}' failed: ${error.message}. Initiating rollback compensation...`);
        
        // Execute compensations in reverse order
        for (let i = executedSteps.length - 1; i >= 0; i--) {
          const compStep = executedSteps[i];
          try {
            this.logger.debug(`[CustomSaga] Compensating step: ${compStep.name}`);
            await compStep.compensate(context);
          } catch (compError) {
            this.logger.error(`[CustomSaga] Error while compensating step '${compStep.name}': ${compError.message}`, compError.stack);
          }
        }

        return {
          success: false,
          context,
          executedSteps: executedSteps.map((s) => s.name),
          failedStep: step.name,
          error,
        };
      }
    }

    return {
      success: true,
      context,
      executedSteps: executedSteps.map((s) => s.name),
    };
  }
}
