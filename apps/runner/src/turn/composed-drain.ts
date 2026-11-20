import type { AgentInboxItem } from '@haus/agent-prompt';
import type { AgentStartCommand } from '@haus/api';
import type { RunAuthority } from '../run-context.ts';
import type { inboxStore } from './inbox-store.ts';
import type { runRecords } from './run-records.ts';

const receiptBatchSize = 100;

export async function attestComposedDrain(
    input: {
        authority: RunAuthority;
        log: (line: string) => void;
        records: ReturnType<typeof runRecords>;
        start: AgentStartCommand;
        store: ReturnType<typeof inboxStore>;
    },
    drained: readonly AgentInboxItem[]
) {
    if (input.start.inboxDelivery !== 'notice' || drained.length === 0) {
        return;
    }
    const identities = drained.map((item) => ({
        chatId: item.chatId,
        id: item.id,
        sequence: item.sequence,
    }));
    await input.records.recordVisible(identities);
    for (let first = 0; first < identities.length; first += receiptBatchSize) {
        const response = await fetch(
            new URL('/api/agent/events/visible', input.authority.serverUrl),
            {
                body: JSON.stringify({
                    composed: true,
                    messages: identities.slice(first, first + receiptBatchSize),
                }),
                headers: {
                    authorization: `Bearer ${input.authority.runCredential}`,
                    'content-type': 'application/json',
                },
                method: 'POST',
            }
        ).catch((error: unknown) => {
            input.log(`Runner could not attest a composed drain: ${String(error)}`);
            return null;
        });
        if (response && !response.ok) {
            input.log(`Runner's composed drain receipt was refused with HTTP ${response.status}.`);
        }
    }
    await input.store.consume(identities.map((identity) => identity.id));
}
