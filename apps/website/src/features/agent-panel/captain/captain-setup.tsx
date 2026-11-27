import type { Agent } from '@haus/api';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { type CaptainDrill, captainSettingDrills } from '../agent-panel-model.ts';
import { CaptainListGroup, useCaptainListCollapse } from '../captain-list.tsx';
import { CaptainFactRows, useCaptainFacts } from './captain-facts.tsx';

const setupDrills = ['runs-on', 'model', 'settings'] as const satisfies readonly CaptainDrill[];

export function CaptainSetup({
    agent,
    onOpen,
    server,
}: {
    agent: Agent;
    onOpen: (drill: CaptainDrill) => void;
    server: ServerDetail;
}) {
    const facts = useCaptainFacts(agent, server);
    const collapse = useCaptainListCollapse();
    return (
        <CaptainListGroup collapse={collapse} title="Setup">
            <CaptainFactRows facts={facts.visible(setupDrills)} label="Setup" onOpen={onOpen} />
        </CaptainListGroup>
    );
}

export function CaptainAllSettings({
    agent,
    onOpen,
    server,
}: {
    agent: Agent;
    onOpen: (drill: CaptainDrill) => void;
    server: ServerDetail;
}) {
    const facts = useCaptainFacts(agent, server);
    return (
        <CaptainFactRows
            facts={facts.visible(captainSettingDrills)}
            label="All settings"
            onOpen={onOpen}
        />
    );
}
