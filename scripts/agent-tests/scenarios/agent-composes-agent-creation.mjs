import { isAbsolute } from 'node:path';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An ordinary Agent answers a natural Agent proposal request from its Owner without creating anything, then a separate creation request creates exactly one Agent inheriting the creator’s runtime and model, named by handle in the creator’s answer in the asking chat with the same session generation and with no introduction from the creator in #haus, joined to #haus and the requested #product, and carrying its standing brief in the workspace MEMORY.md on the Computer; repeating the request creates no second Agent.',
    name: 'agent-composes-agent-creation',
    optIn: true,
    async run({ agents, expect, kit, log, marker, settleTurn }) {
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

        const [creator] = agents;
        const listAgents = () => kit.trpc('agent.list', { serverId: kit.serverId });
        const askChat = await kit.createChannel({ agentIds: [creator.id] });
        const knownAgentIds = new Set((await listAgents()).map((agent) => agent.id));
        const newAgents = async () =>
            (await listAgents()).filter((agent) => !knownAgentIds.has(agent.id));

        const proposalBrief = `@${creator.handle} ${marker('PROPOSE')} Can you propose a CTO / Systems Steward Agent for keeping this Computer reliable and secure?`;
        log('asking the Agent for a prose Agent proposal');
        const proposalReceipt = await kit.harness.send(askChat.id, proposalBrief);
        const proposalTurn = await settleTurn(creator.id, {
            settleWithin: 300_000,
            startWithin: 120_000,
        });
        expect(proposalTurn.status, 'proposal turn status').toBe('completed');
        expect(proposalTurn.failureKind ?? 'none', 'proposal turn failure kind').toBe('none');

        const proposalMessages = (await kit.readMessages(askChat.id)).filter(
            (message) =>
                message.sequence > proposalReceipt.message.sequence &&
                message.author.kind === 'agent' &&
                message.author.agentId === creator.id
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
                'This opt-in scenario requires the seeded #haus and #product channels.'
            );
        }
        const allHeadSequence = await kit.readHead(allChannel.id);

        const creationBrief = `@${creator.handle} ${marker('CREATE')} Looks good. Please create that Agent now. Name it Mossy Lantern, put it in #product, and give it a standing brief for that lane.`;
        log('asking the Agent to create the approved Agent');
        await kit.harness.send(askChat.id, creationBrief);
        const creationTurn = await settleTurn(creator.id, {
            settleWithin: 300_000,
            startWithin: 120_000,
        });
        expect(creationTurn.status, 'creation turn status').toBe('completed');
        expect(creationTurn.failureKind ?? 'none', 'creation turn failure kind').toBe('none');

        const created = await newAgents();
        expect(created, 'exactly one Agent created').toHaveLength(1);
        const createdAgent = created[0];
        await kit.trackAgent(createdAgent);
        knownAgentIds.add(createdAgent.id);

        expect(createdAgent.desiredRuntimeId, 'inherited runtime').toBe(creator.desiredRuntimeId);
        expect(createdAgent.desiredModelId, 'inherited model').toBe(creator.desiredModelId);
        expect(createdAgent.desiredReasoningEffort, 'inherited reasoning effort').toBe(
            creator.desiredReasoningEffort
        );
        expect(createdAgent.computerId, 'inherited Computer').toBe(creator.computerId);

        const creatorIntroductions = (await kit.readMessages(allChannel.id)).filter(
            (message) =>
                message.sequence > allHeadSequence &&
                message.author.kind === 'agent' &&
                message.author.agentId === creator.id &&
                (message.body?.kind === 'agent-created' ||
                    message.content.includes(`@${createdAgent.handle}`) ||
                    message.content.includes(createdAgent.displayName))
        );
        expect(creatorIntroductions, 'the creator posts no introduction in #haus').toHaveLength(0);
        const answers = (await kit.readMessages(askChat.id)).filter(
            (message) =>
                message.author.kind === 'agent' &&
                message.author.agentId === creator.id &&
                message.body?.kind === 'text' &&
                message.content.includes(`@${createdAgent.handle}`)
        );
        expect(answers.length, 'the creator answers the Owner with the new handle').toBeGreaterThan(
            0
        );
        const answer = answers.at(-1);
        expect(answer.sessionGeneration, 'the answer keeps the creator’s session').toBe(
            proposalMessages.at(-1).sessionGeneration
        );
        expect(answer.sessionGeneration, 'the answer has a session stamp').toBeGreaterThan(0);

        const membership = await kit.trpc('chat.list', { serverId: kit.serverId });
        const memberOf = (chatId) =>
            membership
                .find((chat) => chat.id === chatId)
                ?.participantAgentIds.includes(createdAgent.id) ?? false;
        expect(memberOf(allChannel.id), 'the new Agent is in #haus').toBe(true);
        expect(memberOf(productChannel.id), 'the new Agent is in #product').toBe(true);

        const memory = await kit.trpc('agent.workspaceFile', {
            agentId: createdAgent.id,
            path: 'MEMORY.md',
            serverId: kit.serverId,
        });
        expect(memory.content, 'the seeded memory carries the standing brief').toContain(
            `## Standing brief from @${creator.handle}`
        );
        expect(
            memory.content.includes('self-introduction'),
            'the seeded memory leaves the first hello to turn input'
        ).toBe(false);
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
            `@${creator.handle} ${marker('REPEAT')} Did that work? Please make sure ${createdAgent.displayName} exists.`
        );
        const repeatTurn = await settleTurn(creator.id, {
            settleWithin: 300_000,
            startWithin: 120_000,
        });
        expect(repeatTurn.status, 'repeat turn status').toBe('completed');
        expect(await newAgents(), 'no second Agent on a repeat').toHaveLength(0);
    },
});
