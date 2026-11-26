import type { Agent } from '@haus/api';
import { Card } from '@heroui/react';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentRuntimeIssue } from '../agent-runtime-issue.tsx';
import { canRunAgentActions } from './agent-actions-model.ts';
import { AgentCaptainFacts } from './agent-captain-facts.tsx';
import { AgentCaptainIdentity } from './agent-captain-identity.tsx';
import type { AgentSection } from './agent-sections.ts';

export function AgentCaptainCard({
    agent,
    onDeleted,
    onSectionChange,
    revealed,
    server,
}: {
    agent: Agent;
    onDeleted: () => void;
    onSectionChange: (section: AgentSection) => void;
    revealed: boolean;
    server: ServerDetail;
}) {
    return (
        <Card>
            <Card.Header className="gap-2.5">
                <AgentCaptainIdentity
                    agent={agent}
                    onDeleted={onDeleted}
                    onOpenSection={onSectionChange}
                    server={server}
                />
                {agent.description ? (
                    <Card.Description data-selectable-text="">{agent.description}</Card.Description>
                ) : null}
            </Card.Header>
            <Card.Content className="flex flex-col gap-3">
                <AgentRuntimeIssue agent={agent} canRestart={canRunAgentActions(server.role)} />
                <AgentCaptainFacts
                    agent={agent}
                    onOpen={onSectionChange}
                    revealed={revealed}
                    server={server}
                />
            </Card.Content>
        </Card>
    );
}
