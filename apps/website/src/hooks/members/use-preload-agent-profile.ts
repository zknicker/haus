import * as React from 'react';
import { useParams } from 'react-router-dom';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { serverRouteModules } from '../../routes/app/server-route-modules.ts';
import { crewTaskListInput } from '../tasks/use-captain-crew.ts';

/**
 * What a warm path fetches: `profile` is the Captain chat's panel and its Overview reads;
 * `record` is only the Agent record and the panel's drill-in module, for a surface that
 * merely leads toward the Captain (an Agent's DM row opens the Chat instead).
 */
export type AgentProfilePreload = 'profile' | 'record';

/**
 * Warms a Captain's chat and panel on hover, focus, or press, through the same tRPC
 * inputs and freshness its mounted reads use, so the panel paints in one wave.
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
        void serverRouteModules.chat().catch(() => undefined);
        void utils.task.list.prefetch(crewTaskListInput(server.id), queryPolicy.syncedSnapshot);
        // Reminders and triggers render only for Owners and Admins (`useCaptainFacts`).
        if (server.role !== 'member') {
            void utils.reminder.list.prefetch(input, queryPolicy.syncedSnapshot);
            void utils.trigger.list.prefetch(input, queryPolicy.syncedSnapshot);
        }
    }, [agentId, scope, slug, utils]);
}

/**
 * `usePreloadAgentProfile(agentId, 'record')` for a caller that knows its
 * Server, such as a sidebar row: it reads no route, so a navigation (a desktop
 * tab switch) does not re-render it.
 */
export function usePreloadAgentRecord(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    return React.useCallback(() => {
        // The destination retries a failed module preload through its route frame.
        void serverRouteModules.agent().catch(() => undefined);
        void utils.agent.get.prefetch({ agentId, serverId }, queryPolicy.syncedSnapshot);
    }, [agentId, serverId, utils]);
}
