// A `linear` Trigger fires when a Design issue moves from Design Review to
// Changes Requested: the owning Agent answers the fire once, top level in the
// anchor channel (not in a Thread), and names the fire with
// `haus message send --cause <fireId>`. The workspace is seeded on the stack
// (linear-world.mjs) and the delivery is the captured Issue update, signed
// with the stack's Haus app webhook secret and POSTed to /api/linear/webhook
// (linear-deliveries.mjs), as Linear would.

import {
    agentWrites,
    createAgentLinearTrigger,
    issueStateChange,
    journalCommands,
    leakedSecrets,
    postLinearDelivery,
    turnJournals,
    wait,
} from '../linear-deliveries.mjs';
import { seedLinearWorld } from '../linear-world.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'When a linear Trigger fires on a Design Review -> Changes Requested issue update, the fire is recorded and the owning Agent posts exactly one top-level message in the anchor channel, sent with --cause naming that fire, nothing in its Threads, and no Linear token or webhook secret anywhere it wrote or ran.',
    name: 'linear-trigger-fire-reply',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const world = await seedLinearWorld(kit, worker);
        const identifier = `DES-${100 + Number.parseInt(marker('').slice(0, 2), 36)}`;

        try {
            const channel = await kit.createChannel({ agentIds: [worker.id] });
            // A plain FYI, so the worker has no reason to author a Trigger of its own.
            const anchor = await kit.trpc('chat.send', {
                chatId: channel.id,
                content: `Design crit log ${kit.stamp}: the onboarding illustrations go to Design Review this week.`,
                nonce: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
                serverId: kit.serverId,
            });
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);

            log('creating the linear Trigger on the anchor message');
            const created = await createAgentLinearTrigger(kit, {
                agentId: worker.id,
                chatId: channel.id,
                groups: [
                    {
                        actions: ['update'],
                        event: 'issue',
                        stateFrom: ['Design Review'],
                        stateTo: ['Changes Requested'],
                        teams: ['DES'],
                    },
                ],
                instruction:
                    'Tell the channel which issue needs changes, with its identifier and link.',
                messageId: anchor.message.id,
                title: 'Design issue needs changes',
            });
            const owned = await kit.trpc('trigger.list', {
                agentId: worker.id,
                serverId: kit.serverId,
            });
            expect(owned, 'Triggers the worker owns before the fire').toHaveLength(1);
            expect(owned[0].id, 'the created Trigger').toBe(created?.trigger?.id);
            expect(owned[0].anchorChatId, 'Trigger anchor chat').toBe(channel.id);
            const triggerId = owned[0].id;
            const head = await kit.readHead(channel.id);

            log(`moving ${identifier} to Changes Requested`);
            const settling = settleTurn(worker.id, { startWithin: 60_000 });
            await wait(1000);
            const payload = await issueStateChange(world, {
                from: world.states.designReview,
                identifier,
                title: 'Onboarding illustrations: empty states',
                to: world.states.changesRequested,
            });
            const delivery = await postLinearDelivery(kit, world, payload);
            expect(delivery.status, 'webhook delivery status').toBe(200);
            expect(delivery.body?.accepted, 'webhook delivery accepted').toBe(true);
            const turn = await settling;
            expect(turn.status, 'fire turn status').toBe('completed');
            expect(turn.failureKind ?? 'none', 'fire turn failure kind').toBe('none');

            log('checking gates');
            const fires = await kit.trpc('trigger.runs', { serverId: kit.serverId, triggerId });
            expect(fires, 'recorded fires').toHaveLength(1);
            const fireId = fires[0].id;

            const own = (message) =>
                message.author.kind === 'agent' && message.author.agentId === worker.id;
            const topLevel = (await kit.readMessages(channel.id)).filter(
                (message) => own(message) && message.sequence > head
            );
            expect(topLevel, 'top-level posts after the fire').toHaveLength(1);
            expect(topLevel[0].cause?.fireId, 'the answer names the fire').toBe(fireId);
            expect(topLevel[0].cause?.attribution, 'the fire named with --cause').toBe('explicit');
            const page = await kit.trpc('chat.messages', {
                chatId: channel.id,
                limit: 100,
                serverId: kit.serverId,
            });
            const threadPosts = [];
            for (const thread of page.threads ?? []) {
                await kit.trackChat(thread.threadChatId);
                threadPosts.push(...(await kit.readMessages(thread.threadChatId)).filter(own));
            }
            expect(threadPosts, 'Thread posts in the anchor channel').toHaveLength(0);

            const journals = await turnJournals(kit, worker.id, turn);
            const causeSends = journalCommands(journals).filter(
                (command) =>
                    /\bmessage\s+send\b/u.test(command) &&
                    /--cause[\s=]/u.test(command) &&
                    command.includes(fireId)
            );
            expect(
                causeSends.length > 0,
                'a journaled haus message send carrying --cause <fireId>'
            ).toBe(true);
            const written = await agentWrites(kit, worker.id, [
                channel.id,
                ...(worker.dmChatId ? [worker.dmChatId] : []),
            ]);
            expect(leakedSecrets(world.secrets, written), 'secrets in Chats').toHaveLength(0);
            expect(
                leakedSecrets(world.secrets, [JSON.stringify(journals)]),
                'secrets in the journal'
            ).toHaveLength(0);
        } finally {
            const owned = await kit
                .trpc('trigger.list', { agentId: worker.id, serverId: kit.serverId })
                .catch(() => []);
            for (const entry of owned) {
                await kit
                    .trpc('trigger.delete', { serverId: kit.serverId, triggerId: entry.id })
                    .catch(() => undefined);
            }
            await world.cleanup();
        }
    }),
});
