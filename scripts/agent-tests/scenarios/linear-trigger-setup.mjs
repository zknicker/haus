// "Wake me when a design issue moves from Design Review to Changes
// Requested": the Agent authors one `linear` Trigger it owns, anchored on the
// asking message, whose match group stores the transition as workflow-state
// ids, not names (specs/linear-triggers.md#stable-ids). The workspace is
// seeded on the stack and names resolve against the fake Linear
// (linear-world.mjs); no Linear token or webhook secret may reach a Chat or
// the turn's journal.

import {
    agentWrites,
    journalCommands,
    leakedSecrets,
    turnJournals,
} from '../linear-deliveries.mjs';
import { seedLinearWorld } from '../linear-world.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Asked to be woken when a Design issue moves from Design Review to Changes Requested, the Agent creates exactly one linear Trigger it owns, anchored on the asking message, with an issue group whose stateFrom and stateTo hold those workflow-state ids, creates no other Trigger, and leaks no Linear token or webhook secret into any Chat or its journal.',
    name: 'linear-trigger-setup',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const world = await seedLinearWorld(kit, worker);
        try {
            const channel = await kit.createChannel({ agentIds: [worker.id] });
            log('asking for the Linear wake-up');
            const ask = await kit.trpc('chat.send', {
                chatId: channel.id,
                content: `@${worker.handle} Ping me here whenever one of our Design team's issues in Linear goes from Design Review to Changes Requested. I want to jump on those fast.`,
                nonce: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
                serverId: kit.serverId,
            });
            const turn = await settleTurn(worker.id);
            expect(turn.status, 'turn status').toBe('completed');
            expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');

            log('checking gates');
            const owned = await kit.trpc('trigger.list', {
                agentId: worker.id,
                serverId: kit.serverId,
            });
            expect(owned, 'Triggers the worker owns').toHaveLength(1);
            const [trigger] = owned;
            expect(trigger.kind, 'Trigger kind').toBe('linear');
            expect(trigger.ownerAgentId, 'Trigger owner').toBe(worker.id);
            expect(trigger.anchorChatId, 'Trigger anchor chat').toBe(channel.id);
            expect(trigger.anchorMessageId, 'Trigger anchor message').toBe(ask.message.id);
            expect(trigger.linear?.connectionId, 'Trigger connection').toBe(world.connectionId);
            expect(
                world.fakeCalls().includes('HausTriggerCatalog'),
                'names resolved against the fake Linear'
            ).toBe(true);

            const { changesRequested, designReview } = world.states;
            const transition = (trigger.linear?.groups ?? []).filter(
                (group) =>
                    group.event === 'issue' &&
                    sameIds(group.stateFrom, [designReview.id]) &&
                    sameIds(group.stateTo, [changesRequested.id]) &&
                    (group.teams === undefined || sameIds(group.teams, [world.teams.des.id]))
            );
            expect(
                transition,
                'issue groups encoding Design Review -> Changes Requested by state id'
            ).toHaveLength(1);

            const written = await agentWrites(kit, worker.id, [
                channel.id,
                ...(worker.dmChatId ? [worker.dmChatId] : []),
            ]);
            expect(written.length > 0, 'the worker answered').toBe(true);
            expect(leakedSecrets(world.secrets, written), 'secrets in Chats').toHaveLength(0);
            const journals = await turnJournals(kit, worker.id, turn);
            expect(
                journalCommands(journals).some((command) =>
                    /\btrigger\s+create\b[\s\S]*--kind[\s=]+linear\b/u.test(command)
                ),
                'a journaled haus trigger create --kind linear'
            ).toBe(true);
            expect(
                leakedSecrets(world.secrets, [JSON.stringify(journals)]),
                'secrets in the journal'
            ).toHaveLength(0);
        } finally {
            await deleteOwnedTriggers(kit, worker.id);
            await world.cleanup();
        }
    }),
});

function sameIds(actual, expected) {
    return (
        Array.isArray(actual) &&
        actual.length === expected.length &&
        expected.every((id) => actual.includes(id))
    );
}

async function deleteOwnedTriggers(kit, agentId) {
    const owned = await kit
        .trpc('trigger.list', { agentId, serverId: kit.serverId })
        .catch(() => []);
    for (const entry of owned) {
        await kit
            .trpc('trigger.delete', { serverId: kit.serverId, triggerId: entry.id })
            .catch(() => undefined);
    }
}
