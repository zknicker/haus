import type { Agent } from '@haus/api';
import * as React from 'react';
import { useAgentHubReveal } from '../../../hooks/members/use-agent-hub-reveal.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentCaptainCard } from './agent-captain-card.tsx';
import { AgentLoading } from './agent-loading.tsx';
import { loadAgentProfileContent, useLoadedAgentProfileContent } from './agent-profile-module.ts';
import type { AgentSection } from './agent-sections.ts';

const LazyAgentHubContent = React.lazy(async () => ({
    default: (await loadAgentProfileContent()).AgentHubContent,
}));

/**
 * The Captain page: the Captain card beside a Capy Issues-style list of what
 * needs a person, what it is working on, what it did lately, and its Drive.
 * In a wide container the card is a sticky left rail; in the 420px side pane
 * it stacks over the list.
 *
 * The card's identity and fact labels paint at once from the Agent record.
 * Every remote part, the facts and the list, lands as one reveal
 * (`useAgentHubReveal`), and nothing in the card moves when it does.
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
        <div className="grid min-w-0 gap-4 @[52rem]:grid-cols-[20rem_minmax(0,1fr)] @[52rem]:items-start @[52rem]:gap-6">
            <div className="min-w-0 @[52rem]:sticky @[52rem]:top-4">
                <AgentCaptainCard
                    agent={agent}
                    onDeleted={onDeleted}
                    onSectionChange={onSectionChange}
                    revealed={revealed}
                    server={server}
                />
            </div>
            <div className="flex min-w-0 flex-col gap-3">
                {revealed ? (
                    loaded ? (
                        <loaded.AgentHubContent {...content} />
                    ) : (
                        <React.Suspense
                            fallback={<AgentLoading label="Loading Captain activity" />}
                        >
                            <LazyAgentHubContent {...content} />
                        </React.Suspense>
                    )
                ) : null}
            </div>
        </div>
    );
}
