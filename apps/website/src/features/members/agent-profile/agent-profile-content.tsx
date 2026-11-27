import type { Agent } from '@haus/api';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import type { CaptainDrill } from '../../agent-panel/agent-panel-model.ts';
import { AgentActivity, AgentWorkspace } from './agent-content.tsx';
import { AgentProfileCard } from './agent-profile-card.tsx';
import {
    AgentConnectionsSection,
    AgentMachineSection,
    AgentModelSection,
    AgentPermissionsSection,
    AgentSkillsSection,
} from './agent-setup-sections.tsx';

export function CaptainDrillBody({
    agent,
    drill,
    server,
}: {
    agent: Agent;
    drill: Exclude<CaptainDrill, 'automations' | 'settings'>;
    server: ServerDetail;
}) {
    switch (drill) {
        case 'runs-on':
            return <AgentMachineSection agent={agent} server={server} />;
        case 'model':
            return <AgentModelSection agent={agent} server={server} />;
        case 'profile':
            return <AgentProfileCard agent={agent} />;
        case 'skills':
            return <AgentSkillsSection agent={agent} server={server} />;
        case 'connections':
            return <AgentConnectionsSection agent={agent} server={server} />;
        case 'permissions':
            return <AgentPermissionsSection agent={agent} server={server} />;
        case 'activity':
            return <AgentActivity agent={agent} server={server} />;
        case 'workspace':
            return <AgentWorkspace agent={agent} barPlacement="column" server={server} />;
    }
}
