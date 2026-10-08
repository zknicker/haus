import * as React from 'react';
import { useParams } from 'react-router-dom';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { serverRouteModules } from '../../routes/app/server-route-modules.ts';
import { agentActivityHistoryInput } from './use-agent-activity-history.ts';
import { agentTurnsInput } from './use-agent-turns.ts';

/**
 * What a warm path fetches: `profile` is the Agent's page and its hub reads;
 * `record` is only the Agent record and the page module, for a surface that
 * merely leads toward the profile (an Agent's DM row opens the Chat instead).
 */
export type AgentProfilePreload = 'profile' | 'record';

/**
 * Warms an Agent's profile on hover, focus, or press, through the same tRPC
 * inputs and freshness its mounted reads use, so the page paints in one wave.
 * The Server comes from the cached `server.bySlug` read the shell already
 * holds; without it nothing is fetched and the page loads as before.
 */
export function usePreloadAgentProfile(
    agentId: string | undefined,
    scope: AgentProfilePreload = 'profile'
) {
    const utils = hausTrpc.useUtils();
    const { slug = '' } = useParams();

    return React.useCallback(() => {
        // The destination retries a failed module preload through its route frame.
        void serverRouteModules.agent().catch(() => undefined);
        const server = slug ? utils.server.bySlug.getData({ slug }) : undefined;
        if (!(agentId && server)) {
            return;
        }
        const input = { agentId, serverId: server.id };
        void utils.agent.get.prefetch(input, queryPolicy.syncedSnapshot);
        if (scope === 'record') {
            return;
        }
        void utils.agent.deliveryState.prefetch(input, queryPolicy.syncedSnapshot);
        void utils.agent.chats.prefetch(input, queryPolicy.syncedSnapshot);
        void utils.agent.turns.prefetch(
            agentTurnsInput(server.id, agentId),
            queryPolicy.syncedSnapshot
        );
        void utils.agent.activityHistory.prefetch(
            agentActivityHistoryInput(server.id, agentId),
            queryPolicy.syncedSnapshot
        );
        void utils.stats.agentUsage.prefetch(input, queryPolicy.syncedSnapshot);
        // Reminders and triggers render only for Owners and Admins (`AgentHubCards`).
        if (server.role !== 'member') {
            void utils.reminder.list.prefetch(input, queryPolicy.syncedSnapshot);
            void utils.trigger.list.prefetch(input, queryPolicy.syncedSnapshot);
        }
    }, [agentId, scope, slug, utils]);
}
