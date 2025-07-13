import { Lambda } from 'aws-sdk';
import { SQS } from 'aws-sdk';

const lambda = new Lambda({
  region: process.env.AWS_REGION || 'us-east-1'
});

const sqs = new SQS({
  region: process.env.AWS_REGION || 'us-east-1'
});

export interface JobPayload {
  jobId: string;
  userId: string;
  items: any[];
  method: string;
}

export class AsyncJobInvoker {
  private static readonly LARGE_JOB_THRESHOLD = 100; // Items count threshold
  private static readonly SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || '';
  
  /**
   * Determine if a job should be processed asynchronously
   */
  static shouldProcessAsync(itemCount: number): boolean {
    // In Lambda environment, use async for large jobs
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      return itemCount > this.LARGE_JOB_THRESHOLD;
    }
    return false; // Local development always uses sync
  }

  /**
   * Invoke Lambda function asynchronously
   */
  static async invokeLambda(payload: JobPayload): Promise<void> {
    const params = {
      FunctionName: `${process.env.AWS_LAMBDA_FUNCTION_NAME}-processJob`,
      InvocationType: 'Event', // Async invocation
      Payload: JSON.stringify(payload)
    };

    try {
      const result = await lambda.invoke(params).promise();
      console.log(`[AsyncJobInvoker] Lambda invoked for job ${payload.jobId}, status: ${result.StatusCode}`);
    } catch (error) {
      console.error('[AsyncJobInvoker] Failed to invoke Lambda:', error);
      throw new Error('Failed to start async job processing');
    }
  }

  /**
   * Send job to SQS queue
   */
  static async sendToQueue(payload: JobPayload): Promise<void> {
    if (!this.SQS_QUEUE_URL) {
      console.warn('[AsyncJobInvoker] SQS_QUEUE_URL not configured, falling back to Lambda invoke');
      return this.invokeLambda(payload);
    }

    const params = {
      QueueUrl: this.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(payload),
      MessageAttributes: {
        jobId: {
          DataType: 'String',
          StringValue: payload.jobId
        },
        userId: {
          DataType: 'String',
          StringValue: payload.userId
        },
        itemCount: {
          DataType: 'Number',
          StringValue: payload.items.length.toString()
        }
      }
    };

    try {
      const result = await sqs.sendMessage(params).promise();
      console.log(`[AsyncJobInvoker] Job ${payload.jobId} sent to SQS, MessageId: ${result.MessageId}`);
    } catch (error) {
      console.error('[AsyncJobInvoker] Failed to send to SQS:', error);
      throw new Error('Failed to queue job for processing');
    }
  }
}