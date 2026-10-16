import { useLinearStartInstall } from '../../../../../hooks/linear/use-linear-start-install.ts';
import type { BuiltInConnectionDefinition } from '../built-in-connection-definition.ts';
import { LinearAgentAccess } from './linear-agent-access.tsx';
import { LinearSetupNotice } from './linear-setup-notice.tsx';
import { LinearTriggersSection } from './linear-triggers-section.tsx';
import { LinearWorkspaceSection } from './linear-workspace-section.tsx';

/**
 * Linear reads in setup order: the workspace first, then the one Agent list —
 * each Agent's access switch with how it posts in Linear, its identity setup,
 * and the default Agent — then the Agents' Linear Triggers. Connecting
 * installs the Haus app; its callback creates the connection.
 */
export const linearConnectionDefinition: BuiltInConnectionDefinition = {
    AgentAccess: LinearAgentAccess,
    preset: 'linear',
    sections: [
        { id: 'workspace', placement: 'after-account', Section: LinearWorkspaceSection },
        { id: 'triggers', placement: 'after-agent-access', Section: LinearTriggersSection },
    ],
    SetupNotice: LinearSetupNotice,
    useConnect: useLinearStartInstall,
};
