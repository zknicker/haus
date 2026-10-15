import { useLinearStartInstall } from '../../../../../hooks/linear/use-linear-start-install.ts';
import type { BuiltInConnectionDefinition } from '../built-in-connection-definition.ts';
import { LinearIdentitiesSection } from './linear-identities-section.tsx';
import { LinearSetupNotice } from './linear-setup-notice.tsx';
import { LinearTriggersSection } from './linear-triggers-section.tsx';
import { LinearWorkspaceSection } from './linear-workspace-section.tsx';

/**
 * Linear adds its workspace under the account, then who each granted Agent is
 * in Linear and the Agents' Linear Triggers after Agent access. Connecting
 * installs the Haus app; its callback creates the connection.
 */
export const linearConnectionDefinition: BuiltInConnectionDefinition = {
    preset: 'linear',
    sections: [
        { id: 'workspace', placement: 'after-account', Section: LinearWorkspaceSection },
        { id: 'identities', placement: 'after-agent-access', Section: LinearIdentitiesSection },
        { id: 'triggers', placement: 'after-agent-access', Section: LinearTriggersSection },
    ],
    SetupNotice: LinearSetupNotice,
    useConnect: useLinearStartInstall,
};
