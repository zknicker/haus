import type { InvocationRequestFrame } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import type { DesktopLeases } from './desktop-lease.ts';
import type { decideInvocation, InvocationVerdict } from './invocation-gate.ts';

type Decision = Awaited<ReturnType<typeof decideInvocation>>;

export async function leaseDesktop(
    db: HausDatabase,
    leases: DesktopLeases,
    input: { decision: Decision; frame: InvocationRequestFrame; serverId: string }
) {
    const { decision, frame } = input;
    const { computerId } = decision;
    if (
        frame.operation.kind !== 'desktop' ||
        decision.verdict.kind !== 'send' ||
        computerId === null
    ) {
        return { ...decision, desktopHolder: null };
    }
    const claim = leases.claim(
        { computerId, serverId: input.serverId },
        { agentId: frame.agentId, runId: frame.runId }
    );
    if (claim.kind === 'held') {
        return { ...decision, desktopHolder: null };
    }
    const verdict: InvocationVerdict = {
        kind: 'refuse',
        outcome: 'failed',
        refusal: 'desktop-busy',
    };
    return { ...decision, desktopHolder: await agentName(db, claim.agentId), verdict };
}

export function desktopBusyText(computerName: string, holder: string | null | undefined) {
    return `${computerName}'s desktop is in use by ${holder ?? 'another session'}. Nothing ran. Try again once it is done.`;
}

async function agentName(db: HausDatabase, agentId: string) {
    const [agent] = await db
        .select({ displayName: agentsTable.displayName })
        .from(agentsTable)
        .where(eq(agentsTable.id, agentId))
        .limit(1);
    return agent?.displayName ?? null;
}
