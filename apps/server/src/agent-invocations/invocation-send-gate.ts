import type { InvocationRequestFrame } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { gateRepoCheckout } from '../repos/repo-checkout-gate.ts';
import type { createFenceEpochs } from './fence-epochs.ts';
import { settledAnswer } from './invocation-answers.ts';
import { type InvocationRecord, recordSentRefusal } from './invocation-store.ts';

export async function gateSend(
    db: HausDatabase,
    input: {
        appOrigin: string;
        computerId: string;
        fenceEpochs: ReturnType<typeof createFenceEpochs>;
        frame: InvocationRequestFrame;
        record: InvocationRecord;
        serverId: string;
    }
) {
    const { appOrigin, computerId, frame, record, serverId } = input;
    const gated = await gateRepoCheckout(db, {
        appOrigin,
        computerId,
        invocationId: record.id,
        key: frame,
        operation: frame.operation,
        serverId,
    });
    if (gated.kind === 'refused') {
        return gated;
    }
    const target = { agentId: frame.agentId, computerId, serverId };
    if (await input.fenceEpochs.allowsSend(db, target)) {
        return gated;
    }
    const refused = await recordSentRefusal(db, record.id, 'no-access');
    return {
        answer: await settledAnswer(db, { appOrigin, record: refused ?? record }),
        kind: 'refused' as const,
    };
}
