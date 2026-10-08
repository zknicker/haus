import type {
    AgentActivityCursor,
    AgentActivityEvent,
    AgentActivityHistoryPage,
    AgentTurnTrigger,
} from '@haus/api';
import { useQueries } from '@tanstack/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

const activityPageSize = 50;

/** The newest Activity History page an Agent's profile and Activity section read. */
export function agentActivityHistoryInput(serverId: string, agentId: string) {
    return { agentId, limit: activityPageSize, serverId };
}

/**
 * An Agent's Activity History, a page at a time, with the trigger of every run
 * the pages name. The Server shell's activity stream writes live events into
 * the cached newest page (`agent-history-cache.ts`), so this read never
 * subscribes or refetches per event.
 */
export function useAgentActivityHistory(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const scope = `${serverId}:${agentId}`;
    const [cursors, setCursors] = React.useState<Array<AgentActivityCursor | undefined>>([
        undefined,
    ]);
    const scopeRef = React.useRef(scope);
    const activeCursors = scopeRef.current === scope ? cursors : [undefined];

    React.useEffect(() => {
        if (scopeRef.current === scope) {
            return;
        }
        scopeRef.current = scope;
        setCursors([undefined]);
    }, [scope]);

    const pages = useQueries({
        queries: activeCursors.map((before) =>
            utils.agent.activityHistory.queryOptions(
                { ...agentActivityHistoryInput(serverId, agentId), ...(before ? { before } : {}) },
                {
                    ...queryPolicy.syncedSnapshot,
                    enabled: Boolean(serverId && agentId),
                }
            )
        ),
    });
    const lastPage = pages.at(-1);
    const nextBefore = lastPage?.data?.nextBefore ?? null;
    const isFetching = pages.some((page) => page.isFetching);
    const error = pages.find((page) => page.error)?.error ?? null;
    const events = React.useMemo(() => dedupeEvents(pages), [pages]);
    const runTriggers = React.useMemo(() => collectRunTriggers(pages), [pages]);
    const loadMore = React.useCallback(() => {
        if (!nextBefore || isFetching) {
            return;
        }
        setCursors((current) => {
            const last = current.at(-1);
            if (last?.runId === nextBefore.runId && last.position === nextBefore.position) {
                return current;
            }
            return [...current, nextBefore];
        });
    }, [isFetching, nextBefore]);

    return {
        error,
        events,
        hasMore: nextBefore !== null,
        isFetching,
        isPending: pages[0]?.isPending ?? true,
        loadMore,
        runTriggers,
    };
}

export function useAgentTurnActivityHistory(
    serverId: string,
    agentId: string,
    runId: string | null
) {
    return hausTrpc.agent.activityHistory.useQuery(
        {
            agentId,
            limit: 100,
            runId: runId ?? 'run_missing',
            serverId,
        },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: Boolean(serverId && agentId && runId),
        }
    );
}

function collectRunTriggers(
    pages: Array<{ data?: AgentActivityHistoryPage }>
): ReadonlyMap<string, AgentTurnTrigger | null> {
    return new Map(
        pages.flatMap((page) =>
            (page.data?.runTriggers ?? []).map((entry) => [entry.runId, entry.trigger] as const)
        )
    );
}

function dedupeEvents(
    pages: Array<{
        data?: AgentActivityHistoryPage;
    }>
): AgentActivityEvent[] {
    const seen = new Set<string>();
    const events: AgentActivityEvent[] = [];
    for (const page of pages) {
        for (const event of page.data?.events ?? []) {
            if (seen.has(event.id)) {
                continue;
            }
            seen.add(event.id);
            events.push(event);
        }
    }
    return events;
}
