import type { Agent } from '@haus/api';
import * as React from 'react';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentRuntimeIssue } from '../agent-runtime-issue.tsx';
import { AgentHeader } from './agent-header.tsx';
import { AgentHubCards } from './agent-hub-cards.tsx';
import { AgentLoading } from './agent-loading.tsx';
import { loadAgentProfileContent } from './agent-profile-module.ts';
import type { AgentSection } from './agent-sections.ts';

const AgentHubContent = React.lazy(async () => ({
    default: (await loadAgentProfileContent()).AgentHubContent,
}));

/**
 * The profile's home: who the Agent is, a doorway card per section, the Chats
 * it belongs to, what it did lately, and how much it processed. A runtime
 * issue leads under the identity, because when the Agent needs a human that is
 * the first thing to read. Lifecycle verbs live in the header's menu.
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
    return (
        <>
            <AgentHeader agent={agent} onDeleted={onDeleted} server={server} />
            <AgentRuntimeIssue agent={agent} />
            <AgentHubCards agent={agent} onOpen={onSectionChange} server={server} />
            <React.Suspense fallback={<AgentLoading label="Loading Agent activity" />}>
                <AgentHubContent agent={agent} onSectionChange={onSectionChange} server={server} />
            </React.Suspense>
        </>
    );
}
