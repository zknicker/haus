import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useComputers } from '../servers/use-computers.ts';
import { useConnections } from '../servers/use-connections.ts';
import { agentActivityHistoryInput } from './use-agent-activity-history.ts';
import { useAgentChats } from './use-agent-chats.ts';
import { useAgentReminders } from './use-agent-reminders.ts';
import { useAgentTriggers } from './use-agent-triggers.ts';
import { useAgentTurns } from './use-agent-turns.ts';
import { useAgentUsage } from './use-agent-usage.ts';

/** How long the hub waits for its reads before showing whatever has landed. */
export const agentHubRevealDelayMs = 150;

/**
 * Whether the Agent hub shows its remote parts: the card facts and everything
 * below the cards land as one reveal, not one pop per read. Never in the first
 * commit (the header and card frames paint alone); then as soon as every read
 * has settled or {@link agentHubRevealDelayMs} has passed, whichever is first.
 * Once shown it stays shown.
 * Each read here is the one its section renders, so this adds no request.
 */
export function useAgentHubReveal(input: {
    agentId: string;
    canView: boolean;
    serverId: string;
}): boolean {
    const { agentId, canView, serverId } = input;
    const reads = [
        useComputers(serverId),
        useConnections(serverId),
        useAgentChats(serverId, agentId),
        hausTrpc.agent.activityHistory.useQuery(agentActivityHistoryInput(serverId, agentId), {
            ...queryPolicy.syncedSnapshot,
            enabled: Boolean(serverId && agentId),
        }),
        useAgentTurns(serverId, agentId),
        useAgentUsage(serverId, agentId),
    ];
    // Automations are read only by people who may see them; for others they never settle.
    const automations = [
        useAgentReminders(serverId, agentId, canView),
        useAgentTriggers(serverId, agentId, canView),
    ];
    const ready = reads.every(isSettled) && (!canView || automations.every(isSettled));
    const painted = useAfterFirstPaint();
    // The identity and card frames own the first commit; the reveal never joins it.
    return useRevealLatch(ready, agentHubRevealDelayMs) && painted;
}

/**
 * False for this component's first commit, true in a transition after the
 * browser has painted it, so heavy content mounted on it never delays the
 * frame that shows the page's chrome.
 */
export function useAfterFirstPaint(): boolean {
    const [painted, setPainted] = React.useState(false);
    React.useEffect(() => {
        let timer: number | undefined;
        // rAF runs before the paint; a task queued from it runs after.
        const frame = window.requestAnimationFrame(() => {
            timer = window.setTimeout(() => React.startTransition(() => setPainted(true)));
        });
        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(timer);
        };
    }, []);
    return painted;
}

/** `ready`, or `delayMs` after mount, whichever is first; never false again. */
export function useRevealLatch(ready: boolean, delayMs: number): boolean {
    const [latched, setLatched] = React.useState(ready);
    const [timedOut, setTimedOut] = React.useState(false);
    if (ready && !latched) {
        setLatched(true);
    }
    const shown = latched || ready || timedOut;
    React.useEffect(() => {
        if (shown) {
            return;
        }
        const timer = window.setTimeout(() => setTimedOut(true), delayMs);
        return () => window.clearTimeout(timer);
    }, [delayMs, shown]);
    return shown;
}

function isSettled(read: { data: unknown; isError: boolean }) {
    return read.data !== undefined || read.isError;
}
