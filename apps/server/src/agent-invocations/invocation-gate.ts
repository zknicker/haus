import type { InvocationOperation, InvocationRefusal, InvocationRequestFrame } from '@haus/api';
import { isAgentAllowedOn } from '../computer-access/agent-access.ts';
import { desktopGateRefusal } from '../computer-use/computer-use-gate.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { resolveInvocationTarget } from './invocation-target.ts';

export type InvocationVerdict =
    | { kind: 'offline' }
    | { kind: 'refuse'; outcome: 'failed' | 'offline'; refusal: InvocationRefusal }
    | { kind: 'send' };

export async function decideInvocation(
    db: HausDatabase,
    input: {
        frame: InvocationRequestFrame;
        home: string | null;
        isOnline: (computerId: string) => boolean;
        serverId: string;
    }
) {
    const { frame, serverId } = input;
    const target = await resolveInvocationTarget(db, {
        home: input.home,
        requested: frame.computer,
        serverId,
    });
    if (target.kind === 'not-found') {
        return { candidates: target.candidates, computerId: null, verdict: refused('not-found') };
    }
    const { computerId } = target;
    if (computerId === null) {
        const offline: InvocationVerdict = { kind: 'offline' };
        return { candidates: [], computerId, verdict: offline };
    }
    const verdict = await gateInvocation(db, {
        agentId: frame.agentId,
        computerId,
        online: input.isOnline(computerId),
        operation: frame.operation,
        serverId,
    });
    const gone = verdict.kind === 'refuse' && verdict.refusal === 'not-found';
    return { candidates: [], computerId: gone ? null : computerId, verdict };
}

export async function gateInvocation(
    db: HausDatabase,
    input: {
        agentId: string;
        computerId: string;
        online: boolean;
        operation: InvocationOperation;
        serverId: string;
    }
) {
    if (!(await isAgentAllowedOn(db, input))) {
        return refused('no-access');
    }
    if (input.operation.kind === 'desktop') {
        const cause = await desktopGateRefusal(db, input);
        if (cause) {
            return refused(cause);
        }
    }
    const verdict: InvocationVerdict = input.online ? { kind: 'send' } : { kind: 'offline' };
    return verdict;
}

function refused(refusal: InvocationRefusal) {
    const verdict: InvocationVerdict = {
        kind: 'refuse',
        outcome: refusal === 'offline' ? 'offline' : 'failed',
        refusal,
    };
    return verdict;
}
