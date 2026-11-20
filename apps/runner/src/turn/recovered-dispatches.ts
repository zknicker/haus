import type { RecoveredDispatch } from '../dispatch/ledger.ts';
import { unknownToolCalls } from './unknown-tool-calls.ts';

export async function recoverDispatches(
    dispatches: readonly RecoveredDispatch[],
    input: { log: (line: string) => void; runtimeDir: (agentId: string) => string }
) {
    const byAgent = new Map<string, string[]>();
    for (const { agentId, key } of dispatches) {
        input.log(
            `Runner recovered dispatch ${key.runId}:${key.toolCallId}:${key.seq} for ${agentId} as unknown.`
        );
        byAgent.set(agentId, [...(byAgent.get(agentId) ?? []), key.toolCallId]);
    }
    for (const [agentId, toolCallIds] of byAgent) {
        await unknownToolCalls(input.runtimeDir(agentId)).add(toolCallIds);
    }
}
