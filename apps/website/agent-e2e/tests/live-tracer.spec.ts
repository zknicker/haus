import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createAgentChannelFixture } from '../support/agent-channel-fixture.ts';
import {
    expectAgentSettled,
    expectVisibleReply,
    openChat,
    sendFromComposer,
} from '../support/live-agent-app.ts';

test.describe.configure({ mode: 'serial' });

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
let suite: Awaited<ReturnType<typeof setupSuite>>;

test.beforeEach(async () => {
    suite = await setupSuite();
});

test.afterEach(async () => {
    await suite?.cleanup();
});

test('a direct mention reaches the Agent and the reply renders in the App', async ({ page }) => {
    const { agent, channel, channelName, harness, server, stamp } = suite;
    const head = await harness.readHead(channel);
    const token = `TRACER-${stamp}`;

    await openChat(page, server.slug, channel, channelName);
    await sendFromComposer(page, `@${agent.handle} reply with exactly ${token}.`);
    await expectVisibleReply(page, token);

    const messages = await harness.readMessages(channel);
    const replies = harness
        .authoredBy(messages, agent.id, head)
        .map((reply: string) => reply.trim());
    expect(replies.join('\n')).toContain(token);
    await expectAgentSettled(page, agent.id);
});

async function setupSuite() {
    const fixture = await createAgentChannelFixture({
        channelPrefix: 'live-tracer',
        evalName: 'agente2e',
        profiles: [
            {
                description: 'Answers a single direct mention with the exact requested token.',
                name: 'Tracer Alpha',
            },
        ],
        repositoryRoot,
    });
    try {
        const [agent] = fixture.agents;
        if (!agent) {
            throw new Error('The live tracer needs one disposable Agent.');
        }

        return {
            ...fixture,
            agent,
            stamp: fixture.harness.stamp,
        };
    } catch (error) {
        await fixture.cleanup();
        throw error;
    }
}
