import type { Agent } from '@haus/api';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentUsageTile } from '../../usage/agent-usage-tile.tsx';
import { AgentChats } from './agent-chats.tsx';
import { AgentActivity, AgentAutomations, AgentWorkspace } from './agent-content.tsx';
import { AgentProfileCard } from './agent-profile-card.tsx';
import { AgentRecentActivity } from './agent-recent-activity.tsx';
import type { AgentSection } from './agent-sections.ts';
import {
    AgentConnectionsSection,
    AgentRuntimeSection,
    AgentSkillsSection,
} from './agent-setup-sections.tsx';

export { AgentWorkspace };

export function AgentHubContent({
    agent,
    server,
    onSectionChange,
}: {
    agent: Agent;
    server: ServerDetail;
    onSectionChange: (section: AgentSection) => void;
}) {
    return (
        <>
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

export function AgentSectionBody({
    agent,
    section,
    server,
}: {
    agent: Agent;
    section: Exclude<AgentSection, 'home' | 'workspace'>;
    server: ServerDetail;
}) {
    switch (section) {
        case 'runtime':
            return <AgentRuntimeSection agent={agent} server={server} />;
        case 'profile':
            return <AgentProfileCard agent={agent} />;
        case 'automations':
            return <AgentAutomations agent={agent} server={server} />;
        case 'skills':
            return <AgentSkillsSection agent={agent} server={server} />;
        case 'connections':
            return <AgentConnectionsSection agent={agent} server={server} />;
        case 'activity':
            return <AgentActivity agent={agent} server={server} />;
    }
}
