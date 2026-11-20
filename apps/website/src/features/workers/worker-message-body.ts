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
    for (const item of items) {
        if (item.kind === 'row' && item.row.kind === 'message' && item.row.message.workerBody) {
            return {
                body: item.row.message.workerBody,
                serverId: item.row.entity?.serverId ?? null,
            };
        }
    }
    return null;
}
