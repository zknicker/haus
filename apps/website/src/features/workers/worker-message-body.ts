import type { MessageBody } from '@haus/api';
import type { TranscriptItem } from '../chats/chat-transcript-model.ts';

export type WorkerMessageBody = Extract<
    MessageBody,
    { kind: 'worker-follow-up' | 'worker-report' }
>;

export function workerMessageBody(body: MessageBody) {
    return body.kind === 'worker-report' || body.kind === 'worker-follow-up' ? body : null;
}

export function turnWorkerBody(items: readonly TranscriptItem[]) {
    const first = items.find((item) => item.kind === 'row' && item.row.kind === 'message');
    return first?.kind === 'row' && first.row.kind === 'message'
        ? (first.row.message.workerBody ?? null)
        : null;
}
