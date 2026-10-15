// "Wake me when CI fails on main in acme": with an active Haus GitHub App
// installation on `acme` the worker can use, the Agent creates one `github`
// Trigger (no webhook, no URL, no secret) on that installation, listening to a
// CI event filtered to failure, and confirms in the channel. The installation
// is seeded on the stack's own Server, so no GitHub account is involved
// (scripts/agent-tests/github-world.mjs).

import { githubAccount, seedGithubWorld } from '../github-world.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

const ciEvents = ['workflow_run', 'workflow_job', 'check_suite', 'check_run'];

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An Agent asked to be woken when CI fails on main in a GitHub org it can reach creates exactly one github Trigger anchored in the asking channel on that org installation, listening to a CI event filtered to failure, creates no webhook Trigger, posts no Trigger secret, and confirms in the channel.',
    name: 'github-trigger-ci-setup',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const world = await seedGithubWorld(kit, worker);
        let created = [];

        try {
            const channel = await kit.createChannel({ agentIds: [worker.id] });

            log(`asking for a CI wake on ${githubAccount}`);
            await kit.harness.send(
                channel.id,
                `@${worker.handle} Wake me when CI fails on main anywhere in the ${githubAccount} GitHub org, and post the failing workflow here when it happens.`
            );
            const turn = await settleTurn(worker.id);
            expect(turn.status, 'turn status').toBe('completed');
            expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');

            log('checking gates');
            created = await kit.trpc('trigger.list', {
                agentId: worker.id,
                serverId: kit.serverId,
            });
            const github = created.filter((trigger) => trigger.kind === 'github');
            expect(github, 'github Triggers the worker created').toHaveLength(1);
            expect(
                created.filter((trigger) => trigger.kind === 'webhook'),
                'webhook Triggers the worker created'
            ).toHaveLength(0);
            const [trigger] = github;
            const anchors = await channelAnchors(kit, channel.id);
            expect(
                anchors.has(trigger.anchorChatId),
                'Trigger anchored in the asking channel'
            ).toBe(true);
            expect(trigger.github.installationId, 'Trigger installation').toBe(
                world.installationRowId
            );
            const ci = trigger.github.events.filter((entry) => ciEvents.includes(entry.event));
            expect(ci.length > 0, 'a CI event on the Trigger').toBe(true);
            expect(
                ci.every((entry) => entry.conclusions?.includes('failure')),
                'every CI event filtered to failure'
            ).toBe(true);

            const written = await everyAgentMessage(kit, worker, channel.id);
            expect(written.length > 0, 'the worker confirmed').toBe(true);
            expect(
                written.filter((content) => /grtt_/u.test(content)),
                'messages carrying a Trigger secret'
            ).toHaveLength(0);
            const confirmed = (await kit.readMessages(channel.id)).filter(
                (message) => message.author.kind === 'agent' && message.author.agentId === worker.id
            );
            expect(confirmed.length > 0, 'a confirmation in the channel itself').toBe(true);
        } finally {
            const owned = await kit
                .trpc('trigger.list', { agentId: worker.id, serverId: kit.serverId })
                .catch(() => created);
            for (const trigger of owned) {
                await kit
                    .trpc('trigger.delete', { serverId: kit.serverId, triggerId: trigger.id })
                    .catch(() => undefined);
            }
            await world.cleanup();
        }
    }),
});

/** The channel and its Threads: a Trigger anchored on either sits in the channel. */
async function channelAnchors(kit, channelId) {
    const page = await kit.trpc('chat.messages', {
        chatId: channelId,
        limit: 100,
        serverId: kit.serverId,
    });
    return new Set([channelId, ...(page.threads ?? []).map((thread) => thread.threadChatId)]);
}

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
