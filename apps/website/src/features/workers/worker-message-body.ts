import type { MessageBody } from '@haus/api';

export type WorkerMessageBody = Extract<
    MessageBody,
    { kind: 'worker-follow-up' | 'worker-report' }
>;

export function workerMessageBody(body: MessageBody) {
    return body.kind === 'worker-report' || body.kind === 'worker-follow-up' ? body : null;
}
