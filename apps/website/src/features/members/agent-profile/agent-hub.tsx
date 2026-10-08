import type { Agent } from '@haus/api';
import * as React from 'react';
import { useAgentHubReveal } from '../../../hooks/members/use-agent-hub-reveal.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentRuntimeIssue } from '../agent-runtime-issue.tsx';
import { canRunAgentActions } from './agent-actions-model.ts';
import { AgentHeader } from './agent-header.tsx';
import { AgentHubCards } from './agent-hub-cards.tsx';
import { AgentLoading } from './agent-loading.tsx';
import { loadAgentProfileContent, useLoadedAgentProfileContent } from './agent-profile-module.ts';
import type { AgentSection } from './agent-sections.ts';

const LazyAgentHubContent = React.lazy(async () => ({
    default: (await loadAgentProfileContent()).AgentHubContent,
}));

/**
 * The profile's home: who the Agent is, a doorway card per section, the Chats
 * it belongs to, what it did lately, and how much it processed. A runtime
 * issue or wake pause leads under the identity, because when the Agent needs a human that is
 * the first thing to read. Lifecycle verbs live in the header's menu.
 *
 * The identity and the cards' titles paint at once from the Agent record. Every
 * remote part — the cards' facts and the lists below — lands as one reveal
 * (`useAgentHubReveal`), and nothing above the lists moves when it does.
 */
export function AgentHub({
    agent,
    onDeleted,
    onSectionChange,
    server,
}: {
    agent: Agent;
    onDeleted: () => void;
    onSectionChange: (section: AgentSection) => void;
    server: ServerDetail;
}) {
    const revealed = useAgentHubReveal({
        agentId: agent.id,
        canView: server.role !== 'member',
        serverId: server.id,
    });
    const loaded = useLoadedAgentProfileContent();
    const content = { agent, onSectionChange, server };

    return (
        <>
            <AgentHeader agent={agent} onDeleted={onDeleted} server={server} />
            <AgentRuntimeIssue agent={agent} canRestart={canRunAgentActions(server.role)} />
            <AgentHubCards
                agent={agent}
                onOpen={onSectionChange}
                revealed={revealed}
                server={server}
            />
            {revealed ? (
                loaded ? (
                    <loaded.AgentHubContent {...content} />
                ) : (
                    <React.Suspense fallback={<AgentLoading label="Loading Agent activity" />}>
                        <LazyAgentHubContent {...content} />
                    </React.Suspense>
                )
            ) : null}
        </>
    );
}
