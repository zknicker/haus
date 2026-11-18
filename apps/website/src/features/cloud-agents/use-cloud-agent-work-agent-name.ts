import type { Agent, CloudAgentWork } from '@haus/api';
import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useServer } from '../../hooks/servers/use-server.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { cloudAgentWorkAgentFallbackName } from './cloud-agent-presentation.ts';

/**
 * The delegating Agent's name, from `work.agentId` (ADR 0044). Any Message may
 * link the work, so the linking Message's author says nothing about who
 * delegated it. A retired Agent reads by the tail of its id.
 */
export function useCloudAgentWorkAgentName(work: Pick<CloudAgentWork, 'agentId'>): string {
    const { slug = '' } = useParams();
    const { data: server } = useServer(slug, Boolean(slug));
    const select = React.useCallback(
        (agents: Agent[]) => agents.find((agent) => agent.id === work.agentId)?.displayName,
        [work.agentId]
    );
    const { data: displayName } = hausTrpc.agent.list.useQuery(
        { serverId: server?.id ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: server !== undefined, select }
    );
    return displayName ?? cloudAgentWorkAgentFallbackName(work.agentId);
}
