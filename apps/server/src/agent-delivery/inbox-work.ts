import type { HausDatabase } from '../postgres/connection.ts';
import type { EnqueueInput } from './enqueue-input.ts';
import { enqueueInboxItem, ensureDeliveryState } from './store.ts';

export type InboxWorkInput = EnqueueInput & { source: string };

export interface InboxWork {
    enqueue(tx: HausDatabase, input: InboxWorkInput): Promise<void>;
}

export const inboxWork: InboxWork = {
    enqueue: async (tx, input) => {
        await ensureDeliveryState(tx, { agentId: input.agentId, serverId: input.serverId });
        await enqueueInboxItem(tx, input);
    },
};
