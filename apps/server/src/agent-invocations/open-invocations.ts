import type { DispatchKey, InvokeCommand, InvokeResult } from '@haus/api';
import type { ComputerConnections } from '../computers/connections.ts';
import { desktopActivityTopic } from '../realtime/topics.ts';

export interface OpenInvocation {
    accepted: boolean;
    cancelled: boolean;
    command: InvokeCommand;
    computerId: string;
    fenced: boolean;
    grace: { cancel(): void };
    homeComputerId: string | null;
    key: DispatchKey;
    runSettled: boolean;
    serverId: string;
    stopped: boolean;
}

export interface FenceTarget {
    agentId: string;
    computerId: string;
    serverId: string;
}

export function announceDesktopActivity(invocation: OpenInvocation) {
    if (invocation.command.operation.kind === 'desktop') {
        desktopActivityTopic.announce({
            computerId: invocation.computerId,
            serverId: invocation.serverId,
        });
    }
}

export function stopDesktopCommands(
    open: Map<string, OpenInvocation>,
    computers: Pick<ComputerConnections, 'send'>,
    target: { computerId: string; serverId: string }
) {
    let stopped = 0;
    for (const [invocationId, invocation] of open) {
        if (
            invocation.computerId !== target.computerId ||
            invocation.serverId !== target.serverId ||
            invocation.command.operation.kind !== 'desktop'
        ) {
            continue;
        }
        invocation.cancelled = true;
        invocation.stopped = true;
        computers.send(invocation.computerId, { invocationId, type: 'invoke-cancel' });
        stopped += 1;
    }
    return stopped;
}

export function dropUnstarted(
    computers: Pick<ComputerConnections, 'send'>,
    invocationId: string,
    invocation: OpenInvocation | undefined
) {
    if (invocation) {
        computers.send(invocation.computerId, {
            dropIfNotStarted: true,
            invocationId,
            type: 'invoke-cancel',
        });
    }
}

export function stoppedResult(invocationId: string) {
    const result: InvokeResult = {
        invocationId,
        outcome: 'cancelled',
        output: { kind: 'text', text: '' },
        truncated: false,
        type: 'invoke-result',
    };
    return result;
}

export function markFenced(open: Map<string, OpenInvocation>, target: FenceTarget) {
    const fenced: [string, OpenInvocation][] = [];
    for (const [invocationId, invocation] of open) {
        if (
            invocation.computerId === target.computerId &&
            invocation.serverId === target.serverId &&
            invocation.command.agentId === target.agentId
        ) {
            invocation.fenced = true;
            fenced.push([invocationId, invocation]);
        }
    }
    return fenced;
}
