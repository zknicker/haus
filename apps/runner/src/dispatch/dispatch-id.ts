import type { DispatchKey, InvocationOutcome } from '@haus/api';
import type { DispatchKind, DispatchLedger } from './ledger.ts';

export type RunDispatches = ReturnType<typeof createRunDispatches>;

export function createRunDispatches(input: {
    agentId: string;
    ledger: DispatchLedger;
    runId: string;
}) {
    const nextSeq = new Map<string, number>();
    return {
        async open(toolCallId: string, kind: DispatchKind) {
            const seq = nextSeq.get(toolCallId) ?? 0;
            nextSeq.set(toolCallId, seq + 1);
            const key: DispatchKey = { runId: input.runId, seq, toolCallId };
            await input.ledger.accept(input.agentId, key, kind);
            return key;
        },
        async finish(key: DispatchKey, outcome: InvocationOutcome) {
            await input.ledger.finish(input.agentId, key, outcome);
        },
    };
}
