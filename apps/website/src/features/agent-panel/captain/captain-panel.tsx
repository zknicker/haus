import { openIssueStates } from '@haus/api';
import { Tabs } from '@heroui/react';
import { DashboardSquare01Icon, File01Icon, Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { useIssueList } from '../../../hooks/issues/use-issue-list.ts';
import { useAgent } from '../../../hooks/members/use-agent.ts';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { canOpenCaptainDrill, captainPanelTabs } from '../agent-panel-model.ts';
import { setAgentPanelView, useAgentPanelState } from '../agent-panel-store.ts';
import { AgentPanelToggle } from '../agent-panel-toggle.tsx';
import { CaptainAgentsMd } from './captain-agents-md.tsx';
import { CaptainDrillIn } from './captain-drill-in.tsx';
import { CaptainIssues } from './captain-issues.tsx';
import { CaptainOverview } from './captain-overview.tsx';
import { IssueDrillIn } from './issue-drill-in.tsx';

export function CaptainPanel({
    agentId,
    panelKey,
    server,
}: {
    agentId: string;
    panelKey: string;
    server: ServerDetail;
}) {
    const detail = useAgent(server.id, agentId).data;
    const listed = useAgents(server.id).data?.find((candidate) => candidate.id === agentId);
    const agent = detail ?? listed;
    const { view } = useAgentPanelState(panelKey);
    const drill = view.drill && canOpenCaptainDrill(view.drill, server.role) ? view.drill : null;
    const openIssues = useIssueList(server.id, {
        assignee: { agentId, kind: 'captain' },
        states: [...openIssueStates],
    }).data;
    const showView = (next: typeof view) => setAgentPanelView(panelKey, next);
    const issueDrill = view.issue ? (
        <IssueDrillIn
            backLabel={view.tab === 'issues' ? 'Issues' : 'Overview'}
            issueId={view.issue}
            onBack={() => showView({ drill: view.drill, tab: view.tab })}
            server={server}
        />
    ) : null;

    return (
        <Tabs
            className="agent-panel__tabs flex min-h-0 flex-1 flex-col"
            onSelectionChange={(key) => showView({ drill: null, tab: panelTab(String(key)) })}
            selectedKey={view.tab}
        >
            <div className="flex items-center gap-1 px-2 pt-2">
                <Tabs.ListContainer className="min-w-0 flex-1">
                    <Tabs.List aria-label="Captain panel">
                        <Tabs.Tab id="overview">
                            <Icon aria-hidden="true" icon={DashboardSquare01Icon} size={14} />
                            Overview
                            <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="issues">
                            <Icon aria-hidden="true" icon={Task01Icon} size={14} />
                            Issues
                            {openIssues && openIssues.length > 0 ? (
                                <span className="text-muted tabular-nums">{openIssues.length}</span>
                            ) : null}
                            <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="agents-md">
                            <Icon aria-hidden="true" icon={File01Icon} size={14} />
                            AGENTS.md
                            <Tabs.Indicator />
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs.ListContainer>
                <AgentPanelToggle panelKey={panelKey} />
            </div>
            <Tabs.Panel className={panelBody} id="overview">
                {issueDrill ??
                    (agent ? (
                        drill ? (
                            <CaptainDrillIn
                                agent={agent}
                                drill={drill}
                                onView={showView}
                                server={server}
                            />
                        ) : (
                            <CaptainOverview agent={agent} onView={showView} server={server} />
                        )
                    ) : null)}
            </Tabs.Panel>
            <Tabs.Panel className={panelBody} id="issues">
                {issueDrill ?? (
                    <CaptainIssues
                        agentId={agentId}
                        onOpenIssue={(issue) => showView({ drill: null, issue, tab: 'issues' })}
                        server={server}
                    />
                )}
            </Tabs.Panel>
            <Tabs.Panel className={panelBody} id="agents-md">
                {agent ? <CaptainAgentsMd agent={agent} server={server} /> : null}
            </Tabs.Panel>
        </Tabs>
    );
}

const panelBody = '@container min-h-0 flex-1 overflow-y-auto px-2 pt-3 pb-6';

function panelTab(key: string) {
    return captainPanelTabs.find((tab) => tab === key) ?? 'overview';
}
