import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { claimOn, postsAcross, tasksCreatedBy } from '../task-intake.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'A quick unaddressed request in a two-Agent channel is claimed by the one Agent that answers it, the other stays silent, and neither creates a Task.',
    name: 'task-intake-peer-quick-claim',
    run: withRoutingEvidence(async ({ agents, expect, kit, log }) => {
        const channel = await kit.createChannel({ agentIds: agents.map((agent) => agent.id) });
        const head = await kit.readHead(channel.id);
        const startedAt = new Date().toISOString();

        log('asking the room');
        const request = await kit.harness.send(
            channel.id,
            'Can someone tell me how many seconds are in a week? Need it for a cache TTL.'
        );
        for (const agent of agents) {
            await kit.harness.waitForAgentQuiet(agent.id, 15_000, 300_000);
        }

        log('checking gates');
        const answered = [];
        for (const agent of agents) {
            const posts = await postsAcross(kit, channel.id, agent.id, head);
            if (posts.length > 0) {
                answered.push({ agent, posts });
            }
            expect(
                await tasksCreatedBy(kit, agent.id, startedAt),
                `Tasks @${agent.handle} created`
            ).toHaveLength(0);
        }
        expect(
            answered.map(({ agent }) => agent.handle),
            'Agents that posted'
        ).toHaveLength(1);
        const [{ agent: answerer, posts }] = answered;
        expect(
            posts.some((message) => /604[,.\s]?800/u.test(message.content)),
            'the answer carries 604,800'
        ).toBe(true);
        const claim = await claimOn(kit, channel.id, request.message.id);
        expect(claim?.assigneeAgentId, 'the request is claimed by the Agent that answered').toBe(
            answerer.id
        );
    }),
});
