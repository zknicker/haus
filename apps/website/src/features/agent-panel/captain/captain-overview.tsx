import type { Agent } from '@haus/api';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { canRunAgentActions } from '../../members/agent-profile/agent-actions-model.ts';
import { AgentRuntimeIssue } from '../../members/agent-runtime-issue.tsx';
import type { AgentPanelView } from '../agent-panel-model.ts';
import { CaptainCrew } from './captain-crew.tsx';
import { CaptainDrive } from './captain-drive.tsx';
import { CaptainHeader } from './captain-header.tsx';
import { CaptainNeedsYou } from './captain-needs-you.tsx';
import { CaptainSetup } from './captain-setup.tsx';

export function CaptainOverview({
    agent,
    onView,
    server,
}: {
    agent: Agent;
    onView: (view: AgentPanelView) => void;
    server: ServerDetail;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <CaptainHeader
                agent={agent}
                onOpenProfile={() => onView({ drill: 'profile', tab: 'overview' })}
                server={server}
            />
            <AgentRuntimeIssue agent={agent} canRestart={canRunAgentActions(server.role)} />
            <CaptainNeedsYou
                agent={agent}
                onOpenIssue={(issue) => onView({ drill: null, issue, tab: 'overview' })}
                server={server}
            />
            <CaptainCrew agent={agent} server={server} />
            <CaptainSetup
                agent={agent}
                onOpen={(drill) => onView({ drill, tab: 'overview' })}
                server={server}
            />
            <CaptainDrive agent={agent} server={server} />
        </div>
    );
}
