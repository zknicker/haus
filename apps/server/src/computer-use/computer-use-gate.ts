import type { DispatchKey, InvocationOperation, InvocationResultFrame } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { recordGateRefusal } from '../agent-invocations/invocation-store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';

export async function gateDesktopInvocation(
    db: HausDatabase,
    input: {
        computerId: string;
        invocationId: string;
        key: DispatchKey & { agentId: string };
        operation: InvocationOperation;
        serverId: string;
    }
) {
    if (input.operation.kind !== 'desktop') {
        return null;
    }
    const device = await readComputerUseDevice(db, input);
    if (device?.enabled) {
        return null;
    }
    const refused = await recordGateRefusal(db, input.invocationId);
    return refused
        ? refusal(input.key, input.invocationId, computerUseOffText(device?.name ?? 'this Device'))
        : null;
}

export function computerUseOffText(device: string) {
    return `Computer use is off on ${device}. A person can turn on Computer use allowed in Settings → Devices → ${device}.`;
}

async function readComputerUseDevice(
    db: HausDatabase,
    input: { computerId: string; serverId: string }
) {
    const [computer] = await db
        .select({
            enabled: computersTable.computerUseEnabled,
            inventory: computersTable.reportedInventory,
        })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1);
    if (!computer) {
        return null;
    }
    return { enabled: computer.enabled, name: computer.inventory?.name ?? null };
}

function refusal(key: DispatchKey & { agentId: string }, invocationId: string, text: string) {
    const answer: InvocationResultFrame = {
        agentId: key.agentId,
        invocationId,
        outcome: 'failed',
        output: { kind: 'text', text },
        runId: key.runId,
        seq: key.seq,
        toolCallId: key.toolCallId,
        truncated: false,
        type: 'invocation-result',
    };
    return answer;
}
