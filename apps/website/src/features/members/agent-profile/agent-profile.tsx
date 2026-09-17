import type { Agent } from '@haus/api';
import { Segment } from '@heroui-pro/react';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { PageColumn } from '../../shell/page-column.tsx';
import { SectionHeader } from '../../shell/section-header.tsx';
import { PageTopbar } from '../../shell/shell-topbar.tsx';
import { AgentRuntimeIssue } from '../agent-runtime-issue.tsx';
import {
    AgentActivity,
    AgentAutomations,
    AgentOverview,
    AgentSetup,
    AgentWorkspace,
} from './agent-content.tsx';
import { AgentHeader } from './agent-header.tsx';
import type { AgentTab } from './agent-tabs.ts';
import { isAgentTab } from './agent-tabs.ts';

/**
 * Text only. The icons were sized from `--spacing` by Segment's own CSS, so
 * they tracked whatever density the strip ran at rather than the label beside
 * them — and five words need no glyphs to tell them apart.
 */
const tabOptions = [
    { label: 'Overview', value: 'overview' },
    { label: 'Setup', value: 'setup' },
    { label: 'Automations', value: 'automations' },
    { label: 'Activity', value: 'activity' },
    { label: 'Workspace', value: 'workspace' },
] as const;

/**
 * An Agent's own page in the Server layout: the shell band names the Agent and
 * carries its tabs, then the identity header, then the tab's sections in the
 * one reading column every routed destination shares.
 */
export function AgentProfilePage({
    agent,
    onDeleted,
    onTabChange,
    server,
    tab,
}: {
    agent: Agent;
    onDeleted: () => void;
    onTabChange: (tab: AgentTab) => void;
    server: ServerDetail;
    tab: AgentTab;
}) {
    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <PageTopbar>
                <SectionHeader title={agent.displayName}>
                    <AgentProfileTabs onTabChange={onTabChange} tab={tab} />
                </SectionHeader>
            </PageTopbar>
            {tab === 'workspace' ? (
                // The file browser is a full-height tool surface with its own
                // rail and scroll, so it takes the viewport below the band
                // instead of sitting in the reading column. The band still
                // carries the Agent's name and its tabs.
                <div className="min-h-0 flex-1 overflow-hidden">
                    <AgentWorkspace agent={agent} server={server} />
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                    <PageColumn>
                        <AgentHeader agent={agent} onDeleted={onDeleted} server={server} />
                        <AgentRuntimeIssue agent={agent} />
                        <AgentTabContent agent={agent} server={server} tab={tab} />
                    </PageColumn>
                </div>
            )}
        </div>
    );
}

function AgentProfileTabs({
    onTabChange,
    tab,
}: {
    onTabChange: (tab: AgentTab) => void;
    tab: AgentTab;
}) {
    return (
        <Segment
            aria-label="Agent sections"
            onSelectionChange={(key) => {
                const next = String(key);
                if (isAgentTab(next)) {
                    onTabChange(next);
                }
            }}
            selectedKey={tab}
            // `sm` is an 11px segment — badge size, next to a 13px band title.
            // `md` is the body step.
            size="md"
            variant="ghost"
        >
            {tabOptions.map((option) => (
                <Segment.Item id={option.value} key={option.value}>
                    {option.label}
                </Segment.Item>
            ))}
        </Segment>
    );
}

function AgentTabContent({
    agent,
    server,
    tab,
}: {
    agent: Agent;
    server: ServerDetail;
    tab: Exclude<AgentTab, 'workspace'>;
}) {
    switch (tab) {
        case 'overview':
            return <AgentOverview agent={agent} server={server} />;
        case 'setup':
            return <AgentSetup agent={agent} server={server} />;
        case 'automations':
            return <AgentAutomations agent={agent} server={server} />;
        case 'activity':
            return <AgentActivity agent={agent} server={server} />;
    }
}
