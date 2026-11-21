import type { DispatchKey, InvokeCommand } from '@haus/api';
import type { ComputerConnections } from '../computers/connections.ts';
import { desktopActivityTopic } from '../realtime/topics.ts';

export interface OpenInvocation {
    accepted: boolean;
    cancelled: boolean;
    command: InvokeCommand;
    computerId: string;
    grace: { cancel(): void };
    key: DispatchKey;
    runSettled: boolean;
    serverId: string;
    stopped: boolean;
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
