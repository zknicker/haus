import type { Agent } from '@haus/api';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentUsageTile } from '../../usage/agent-usage-tile.tsx';
import { AgentRuntimeIssue } from '../agent-runtime-issue.tsx';
import { AgentChats } from './agent-chats.tsx';
import { AgentHeader } from './agent-header.tsx';
import { AgentHubCards } from './agent-hub-cards.tsx';
import { AgentRecentActivity } from './agent-recent-activity.tsx';
import type { AgentSection } from './agent-sections.ts';

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
            <AgentChats agent={agent} server={server} />
            <AgentRecentActivity
                agent={agent}
                onSeeAll={() => onSectionChange('activity')}
                server={server}
            />
            <AgentUsageTile agent={agent} server={server} />
        </>
    );
}
