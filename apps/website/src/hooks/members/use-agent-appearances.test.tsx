import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { Agent } from '@haus/api';
import { installKeptChatViewTestDom } from '../../test-support/kept-chat-views-harness.tsx';
import {
    agents,
    createTranscriptHarness,
    installTranscriptBrowserStubs,
    serverId,
} from '../../test-support/transcript-render-harness.tsx';
import { useAgentAppearances } from './use-agents.ts';

installKeptChatViewTestDom();
let restoreStubs: () => void;
beforeAll(() => {
    restoreStubs = installTranscriptBrowserStubs();
});
afterAll(() => restoreStubs());

const seen: (readonly Agent[])[] = [];
function AppearanceReader() {
    seen.push(useAgentAppearances(serverId));
    return null;
}

test('an availability flip renders no appearance reader; a rendered field change does', async () => {
    const harness = createTranscriptHarness();
    const view = await harness.mount(<AppearanceReader />);
    const first = seen.at(-1);

    const flip = await harness.change(() => {
        harness.utils.agent.list.setData(
            { serverId },
            agents.map((agent) => ({ ...agent, availability: 'working' as const }))
        );
    });
    expect(flip.count('AppearanceReader')).toBe(0);
    expect(seen.at(-1)).toBe(first);

    const rename = await harness.change(() => {
        harness.utils.agent.list.setData(
            { serverId },
            agents.map((agent) => ({ ...agent, displayName: `${agent.displayName} 2` }))
        );
    });
    expect(rename.count('AppearanceReader')).toBe(1);
    expect(seen.at(-1)?.map((agent) => agent.displayName)).toEqual(['Blippy 2', 'Tiny 2']);

    await view.unmount();
});
