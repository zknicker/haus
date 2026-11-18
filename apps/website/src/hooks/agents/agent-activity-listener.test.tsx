import { afterAll, beforeAll, expect, test } from 'bun:test';
import { installKeptChatViewTestDom } from '../../test-support/kept-chat-views-harness.tsx';
import {
    agents,
    createTranscriptHarness,
    installTranscriptBrowserStubs,
    serverId,
} from '../../test-support/transcript-render-harness.tsx';
import {
    AgentActivityProvider,
    useAgentActivityListener,
    useOptionalCurrentAgentActivity,
} from './use-current-agent-activity.tsx';

installKeptChatViewTestDom();
let restoreStubs: () => void;
beforeAll(() => {
    restoreStubs = installTranscriptBrowserStubs();
});
afterAll(() => restoreStubs());

// Every kept chat view's typing row listens for activity events. The
// listener subscription must not ride the activity snapshot, which changes
// with every live event and every Agent availability flip.
function ActivityListener() {
    useAgentActivityListener(() => undefined);
    return null;
}

function ActivityReader() {
    useOptionalCurrentAgentActivity();
    return null;
}

test('an activity snapshot change re-renders its readers, not its listeners', async () => {
    const harness = createTranscriptHarness();
    const view = await harness.mount(
        <AgentActivityProvider serverId={serverId}>
            <ActivityListener />
            <ActivityReader />
        </AgentActivityProvider>
    );

    const census = await harness.change(() => {
        harness.utils.agent.list.setData(
            { serverId },
            agents.map((agent) => ({ ...agent, availability: 'working' as const }))
        );
    });

    expect(census.count('ActivityReader')).toBe(1);
    expect(census.count('ActivityListener')).toBe(0);

    await view.unmount();
});
