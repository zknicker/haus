// Opt-in live proof for Cove's factory Agent-creation guidance. This uses the
// real seeded Server and attached Computer; the image fixture makes the avatar
// provider boundary deterministic without persisting the concept or calling OpenAI.
//
// Cove is the seeded factory Agent, not a provisioned fixture, so this scenario
// owns its starting state: it retires the teammate an earlier run had Cove
// create and resets Cove to factory — session, workspace, MEMORY.md — through
// the product's own Full Reset.
//
// The Owner asks in a fresh channel. Cove creates there, then introduces the
// returned identity in #all through ordinary message send.

import { isAbsolute } from 'node:path';
import { defineScenario } from '../scenario.mjs';
import {
    resetAgentToFactory,
    retireAgentsCreatedBy,
    withTemporaryAgentConfiguration,
} from '../test-support.mjs';

export default defineScenario({
    contract:
        'Cove answers a natural Agent proposal request from its Owner without creating anything, then a separate creation request creates exactly one Agent inheriting Cove’s runtime and model, introduced through ordinary message send in #all with the same session generation, joined to #all and the requested #product, and carrying its standing brief in the workspace MEMORY.md on the Computer; repeating the request creates no second Agent.',
    name: 'cove-composes-agent-creation',
    optIn: true,
    async run({ expect, kit, log, marker, settleTurn }) {
        const fixturePath = process.env.HAUS_AGENT_E2E_AVATAR_FIXTURE_PATH;
        const requestLogPath = process.env.HAUS_AGENT_E2E_AVATAR_REQUEST_LOG;
        if (
            process.env.HAUS_AGENT_E2E_AVATAR_FIXTURE !== '1' ||
            !fixturePath ||
            !isAbsolute(fixturePath) ||
            !requestLogPath ||
            !isAbsolute(requestLogPath)
        ) {
            throw new Error(
                'This opt-in scenario requires HAUS_AGENT_E2E_AVATAR_FIXTURE=1, an absolute HAUS_AGENT_E2E_AVATAR_FIXTURE_PATH, and an absolute HAUS_AGENT_E2E_AVATAR_REQUEST_LOG.'
            );
        }

        const listAgents = () => kit.trpc('agent.list', { serverId: kit.serverId });
        const seeded = (await listAgents()).find(
            (agent) => agent.factoryKind === 'cove' && agent.handle === 'cove'
        );
        if (!seeded) {
            throw new Error(
                'This opt-in scenario requires an active Cove created through the onboarding flow.'
            );
        }
        if (!(seeded.desiredModelId && seeded.desiredRuntimeId)) {
            throw new Error(
                'This opt-in scenario requires Cove to have a configured runtime and model.'
            );
        }

        await retireAgentsCreatedBy(kit.harness, seeded.id, { log });
        const cove = await resetAgentToFactory(kit.harness, seeded, { log });
        const askChat = await kit.createChannel({ agentIds: [cove.id] });

        const target = { modelId: cove.desiredModelId, runtimeId: cove.desiredRuntimeId };
        // Snapshotted after the reset, so an Agent this run finds new is one
        // this run's own turns created.
        const knownAgentIds = new Set((await listAgents()).map((agent) => agent.id));
        const newAgents = async () =>
            (await listAgents()).filter((agent) => !knownAgentIds.has(agent.id));

        await withTemporaryAgentConfiguration(
            kit.harness,
            cove,
            target,
            async () => {
                const proposalBrief = `@${cove.handle} ${marker('COVE')} Can you propose a CTO / Systems Steward Agent for keeping this Computer reliable and secure?`;

                log('asking Cove for a prose Agent proposal');
                const proposalReceipt = await kit.harness.send(askChat.id, proposalBrief);
                const proposalTurn = await settleTurn(cove.id, {
                    settleWithin: 300_000,
                    startWithin: 120_000,
                });
                expect(proposalTurn.status, 'proposal turn status').toBe('completed');
                expect(proposalTurn.failureKind ?? 'none', 'proposal turn failure kind').toBe(
                    'none'
                );

                const proposalMessages = (await kit.readMessages(askChat.id)).filter(
                    (message) =>
                        message.sequence > proposalReceipt.message.sequence &&
                        message.author.kind === 'agent' &&
                        message.author.agentId === cove.id
                );
                expect(
                    proposalMessages.filter((message) => message.content.trim().length > 0).length,
                    'a substantive proposal in the chat the Owner asked in'
                ).toBeGreaterThan(0);
                expect(
                    proposalMessages.filter((message) => message.body?.kind === 'agent-created'),
                    'no creation before the owner asks for it'
                ).toHaveLength(0);
                expect(await newAgents(), 'no Agent created by the proposal turn').toHaveLength(0);

                const chats = await kit.trpc('chat.list', { serverId: kit.serverId });
                const allChannel = chats.find((chat) => chat.isAll);
                const productChannel = chats.find(
                    (chat) => chat.kind === 'channel' && chat.name === 'product'
                );
                if (!(allChannel && productChannel)) {
                    throw new Error(
                        'This opt-in scenario requires the seeded #all and #product channels.'
                    );
                }
                const allHeadSequence = await kit.readHead(allChannel.id);

                const creationBrief = `@${cove.handle} ${marker('CREATE')} Looks good. Please create that Agent now. Name it Mossy Lantern, put it in #product, and give it a standing brief for that lane.`;
                log('asking Cove to create the approved Agent');
                await kit.harness.send(askChat.id, creationBrief);
                const creationTurn = await settleTurn(cove.id, {
                    settleWithin: 300_000,
                    startWithin: 120_000,
                });
                expect(creationTurn.status, 'creation turn status').toBe('completed');
                expect(creationTurn.failureKind ?? 'none', 'creation turn failure kind').toBe(
                    'none'
                );

                const created = await newAgents();
                expect(created, 'exactly one Agent created').toHaveLength(1);
                const createdAgent = created[0];
                await kit.trackAgent(createdAgent);
                knownAgentIds.add(createdAgent.id);

                // Runtime, model, reasoning effort, and Computer inherit from Cove.
                expect(createdAgent.desiredRuntimeId, 'inherited runtime').toBe(target.runtimeId);
                expect(createdAgent.desiredModelId, 'inherited model').toBe(target.modelId);
                expect(createdAgent.desiredReasoningEffort, 'inherited reasoning effort').toBe(
                    cove.desiredReasoningEffort
                );
                expect(createdAgent.computerId, 'inherited Computer').toBe(cove.computerId);

                // A creation is a team event, so the announcement lands in #all —
                // not in the chat the Owner happened to ask from.
                const announcements = (await kit.readMessages(allChannel.id)).filter(
                    (message) =>
                        message.sequence > allHeadSequence &&
                        message.author.kind === 'agent' &&
                        message.author.agentId === cove.id &&
                        message.body?.kind === 'text' &&
                        message.content.includes(`agent://${createdAgent.id}`)
                );
                expect(announcements, 'one ordinary introduction in #all').toHaveLength(1);
                const announcement = announcements[0];
                expect(announcement.body.kind, 'ordinary Message body').toBe('text');
                expect(announcement.sessionGeneration, 'introduction keeps Cove’s session').toBe(
                    proposalMessages.at(-1).sessionGeneration
                );
                expect(
                    announcement.sessionGeneration,
                    'introduction has a session stamp'
                ).toBeGreaterThan(0);
                expect(
                    announcement.content.trim().length,
                    'the announcement carries Cove’s own words'
                ).toBeGreaterThan(0);
                // The mention is the only way a human reaches the new profile,
                // so the announcement has to name the teammate it made.
                expect(
                    announcement.content,
                    'the announcement mentions the new Agent by handle'
                ).toContain(`@${createdAgent.handle}`);

                // #all is the Server's guarantee; #product is what the request named.
                const membership = await kit.trpc('chat.list', { serverId: kit.serverId });
                const memberOf = (chatId) =>
                    membership
                        .find((chat) => chat.id === chatId)
                        ?.participantAgentIds.includes(createdAgent.id) ?? false;
                expect(memberOf(allChannel.id), 'the new Agent is in #all').toBe(true);
                expect(memberOf(productChannel.id), 'the new Agent is in #product').toBe(true);

                // The brief is memory on the Computer, not a message: it reaches the
                // new Agent through the workspace its configure seeded.
                const memory = await kit.trpc('agent.workspaceFile', {
                    agentId: createdAgent.id,
                    path: 'MEMORY.md',
                    serverId: kit.serverId,
                });
                expect(memory.content, 'the seeded memory carries the standing brief').toContain(
                    `## Standing brief from @${cove.handle}`
                );
                expect(
                    memory.content,
                    'the seeded memory asks for a first hello in #all'
                ).toContain('say hello in #all in your own voice');
                // Nothing DMs the new Agent — a DM is human ↔ Agent.
                expect(
                    membership.filter(
                        (chat) =>
                            chat.kind === 'dm' &&
                            chat.participantAgentIds.includes(createdAgent.id) &&
                            chat.lastMessageSequence > 0
                    ),
                    'no message was sent into the new Agent’s DM'
                ).toHaveLength(0);

                log('repeating the creation request');
                await kit.harness.send(
                    askChat.id,
                    `@${cove.handle} ${marker('REPEAT')} Did that work? Please make sure ${createdAgent.displayName} exists.`
                );
                const repeatTurn = await settleTurn(cove.id, {
                    settleWithin: 300_000,
                    startWithin: 120_000,
                });
                expect(repeatTurn.status, 'repeat turn status').toBe('completed');
                expect(await newAgents(), 'no second Agent on a repeat').toHaveLength(0);
            },
            log
        );
    },
});
