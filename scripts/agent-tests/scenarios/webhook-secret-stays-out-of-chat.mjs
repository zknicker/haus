// "Set up a webhook for my service": the Agent creates a webhook Trigger and
// hands over the URL, but the bearer secret (`grtt_…`) never appears in any
// Chat, DM included. The human reveals a fresh secret in the App instead
// (specs/github-triggers.md#agent-cli-and-manual).

import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An Agent asked for a webhook its service can call creates one webhook Trigger anchored in the asking channel, shares the URL, and posts no Trigger secret in any Chat it can write to.',
    name: 'webhook-secret-stays-out-of-chat',
    async run({ agents, expect, kit, log, settleTurn }) {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        let triggers = [];

        try {
            log('asking for the webhook');
            await kit.harness.send(
                channel.id,
                `@${worker.handle} Set up a webhook for my billing service so it can wake you whenever an invoice fails. Give me whatever I need to wire it up.`
            );
            const turn = await settleTurn(worker.id);
            expect(turn.status, 'turn status').toBe('completed');
            expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');

            log('checking gates');
            triggers = (
                await kit.trpc('trigger.list', { agentId: worker.id, serverId: kit.serverId })
            ).filter((trigger) => trigger.kind === 'webhook');
            expect(triggers, 'webhook Triggers the worker created').toHaveLength(1);

            const written = await everyAgentMessage(kit, worker, channel.id);
            expect(written.length > 0, 'the worker answered').toBe(true);
            expect(
                written.filter((content) => /grtt_/u.test(content)),
                'messages carrying a Trigger secret'
            ).toHaveLength(0);
            expect(
                written.some((content) => content.includes(triggers[0].url)),
                'the Trigger URL handed over'
            ).toBe(true);
        } finally {
            for (const trigger of triggers) {
                await kit
                    .trpc('trigger.delete', { serverId: kit.serverId, triggerId: trigger.id })
                    .catch(() => undefined);
            }
        }
    },
});

/** Everything the worker wrote in the channel, its Threads, and its Owner DM. */
async function everyAgentMessage(kit, worker, channelId) {
    const chatIds = [channelId, ...(worker.dmChatId ? [worker.dmChatId] : [])];
    const written = [];
    for (const chatId of chatIds) {
        const page = await kit.trpc('chat.messages', {
            chatId,
            limit: 100,
            serverId: kit.serverId,
        });
        written.push(...kit.authoredBy(page.messages, worker.id));
        for (const thread of page.threads ?? []) {
            written.push(...kit.authoredBy(await kit.readMessages(thread.threadChatId), worker.id));
        }
    }
    return written;
}
