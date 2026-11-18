import type { AgentActivityHistoryPage } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

const previewEventLimit = 5;

/**
 * The hover card's latest few events. Live events reach this cached page from
 * the Server shell's activity stream (`agent-history-cache.ts`), which grows
 * the page rather than trimming it, so the preview trims at read time.
 */
export function useAgentActivityPreview(serverId: string, agentId: string) {
    return hausTrpc.agent.activityHistory.useQuery(
        { agentId, limit: previewEventLimit, serverId },
        { ...queryPolicy.syncedSnapshot, select: selectActivityPreview }
    );
}

export function selectActivityPreview(page: AgentActivityHistoryPage): AgentActivityHistoryPage {
    return page.events.length <= previewEventLimit
        ? page
        : { ...page, events: page.events.slice(0, previewEventLimit) };
}
