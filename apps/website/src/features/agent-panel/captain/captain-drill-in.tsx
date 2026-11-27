import type { Agent } from '@haus/api';
import * as React from 'react';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentLoading } from '../../members/agent-profile/agent-loading.tsx';
import {
    loadAgentProfileContent,
    useLoadedAgentProfileContent,
} from '../../members/agent-profile/agent-profile-module.ts';
import {
    type AgentPanelView,
    type CaptainDrill,
    captainDrillLabels,
    drillParent,
    overviewView,
} from '../agent-panel-model.ts';
import { AutomationActions } from './automation-actions.tsx';
import { type AutomationHistory, CaptainAutomations } from './captain-automations.tsx';
import { CaptainAllSettings } from './captain-setup.tsx';
import { PanelDrillHeader } from './panel-drill-header.tsx';

const LazyDrillBody = React.lazy(async () => ({
    default: (await loadAgentProfileContent()).CaptainDrillBody,
}));

export function CaptainDrillIn({
    agent,
    drill,
    onView,
    server,
}: {
    agent: Agent;
    drill: CaptainDrill;
    onView: (view: AgentPanelView) => void;
    server: ServerDetail;
}) {
    const parent = drillParent(drill);
    const back = () => onView(parent ? { drill: parent, tab: 'overview' } : overviewView);
    const backLabel = parent ? captainDrillLabels[parent] : 'Overview';
    const open = (next: CaptainDrill) => onView({ drill: next, tab: 'overview' });
    const [creating, setCreating] = React.useState(false);
    const [history, setHistory] = React.useState<AutomationHistory | null>(null);

    const canCreate = drill === 'automations' && server.role !== 'member';

    return (
        <div className="flex min-w-0 flex-col gap-3" key={drill}>
            <PanelDrillHeader
                action={
                    canCreate ? (
                        <AutomationActions onHistory={setHistory} onNew={() => setCreating(true)} />
                    ) : null
                }
                backLabel={backLabel}
                onBack={back}
            >
                {captainDrillLabels[drill]}
            </PanelDrillHeader>
            {drill === 'settings' ? (
                <CaptainAllSettings agent={agent} onOpen={open} server={server} />
            ) : drill === 'automations' ? (
                <CaptainAutomations
                    agent={agent}
                    creating={creating}
                    history={history}
                    onCreatingChange={setCreating}
                    onHistoryChange={setHistory}
                    server={server}
                />
            ) : (
                <div
                    className={
                        drill === 'activity' ? 'min-w-0' : 'settings-frame flex flex-col gap-6'
                    }
                >
                    <DrillBody agent={agent} drill={drill} server={server} />
                </div>
            )}
        </div>
    );
}

function DrillBody(props: {
    agent: Agent;
    drill: Exclude<CaptainDrill, 'automations' | 'settings'>;
    server: ServerDetail;
}) {
    const loaded = useLoadedAgentProfileContent();
    return loaded ? (
        <loaded.CaptainDrillBody {...props} />
    ) : (
        <React.Suspense fallback={<AgentLoading label="Loading Captain settings" />}>
            <LazyDrillBody {...props} />
        </React.Suspense>
    );
}
