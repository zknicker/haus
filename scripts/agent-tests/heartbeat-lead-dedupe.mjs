// Two Agents that both cover pricing and both hold the same private source meet one
// unanswered question (specs/heartbeat.md#evals). Gated on OUTCOME only: the question
// is answered with the facts that live behind the connection, the connection was
// searched by exactly one Agent, and exactly one answer was posted. Whether the Agents
// used `haus lead claim` to get there is recorded for diagnosis, never asserted.

import { startControlledMcp } from './controlled-mcp.mjs';
import {
    agentPosts,
    journalCommands,
    renderMemory,
    seedMessages,
    writeEvidence,
    writeMemory,
} from './heartbeat.mjs';

export const pricingQuestion =
    'Does the Q3 pricing page mention the annual discount, and for which plans?';
export const pricingRecord = Object.freeze([
    'DOC-Q3-PRICING',
    {
        notes: 'Annual discount: 20% off on Pro and Team. Starter has no annual discount.',
        owner: 'Growth',
        status: 'published',
        title: 'Q3 pricing page notes',
    },
]);

/** The answer's facts: the discount rate or the plans that get it. */
export const answerFacts = /20\s*%|\bPro\b|\bTeam\b/u;
const leadCommand = /\bhaus\s+lead\b/u;

/** Outcome of one run from its channel posts and controlled-MCP calls. */
export function leadDedupeOutcome({ calls, posts }) {
    const answerPosts = posts.filter((post) => answerFacts.test(post.content ?? ''));
    const callers = [...new Set(calls.map((call) => call.caller).filter(Boolean))];
    return { answerPosts, answered: answerPosts.length > 0, callers };
}

export async function runLeadDedupe({ agents, expect, kit, log }) {
    const [first, second] = agents;
    const mcp = await startControlledMcp({ recent: true });
    const connectionIds = [];
    try {
        log('adding one connection per Agent to the pricing notes source and granting it');
        mcp.define(...pricingRecord);
        for (const [caller, worker] of [
            ['first', first],
            ['second', second],
        ]) {
            const connection = await kit.trpc('mcp.add', {
                auth: 'none',
                headers: {},
                name: `Pricing Notes ${caller} ${kit.stamp}`,
                oauthScopes: [],
                serverId: kit.serverId,
                url: mcp.urlFor(caller),
            });
            connectionIds.push(connection.id);
            await kit.trpc('mcp.setGrant', {
                agentId: worker.id,
                connectionId: connection.id,
                enabled: true,
                serverId: kit.serverId,
            });
            await writeMemory(
                kit,
                worker.id,
                renderMemory({
                    displayName: worker.displayName ?? worker.handle,
                    keyKnowledge: [
                        'The Pricing Notes MCP connection holds the Q3 pricing page notes; nothing else does.',
                    ],
                    role: 'Pricing researcher. You look into open questions about our pricing and plans.',
                })
            );
        }

        const channel = await kit.createChannel({ agentIds: agents.map((agent) => agent.id) });
        const seeded = await seedMessages(kit, channel.id, [
            {
                authorAgentId: first.id,
                content: 'Pricing questions are mine; ask away.',
                minutesAgo: 120,
            },
            {
                authorAgentId: second.id,
                content: 'I also cover pricing and plans.',
                minutesAgo: 119,
            },
            { content: pricingQuestion, minutesAgo: 90 },
        ]);
        const question = seeded.messages.at(-1);
        const head = await kit.readHead(channel.id);

        log(`daytime heartbeat for @${first.handle}`);
        const firstRun = await kit.startHeartbeat(first.id, 'daytime');
        log(`daytime heartbeat for @${second.handle}`);
        const secondRun = await kit.startHeartbeat(second.id, 'daytime');
        for (const worker of agents) {
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);
        }

        const { leads } = await kit.heartbeatEvidence([first.id, second.id]);
        const posts = [
            ...(await agentPosts(kit, channel.id, first.id, head)),
            ...(await agentPosts(kit, channel.id, second.id, head)),
        ];
        const outcome = leadDedupeOutcome({ calls: mcp.calls, posts });
        const leadCommands = async (worker, run) =>
            (await journalCommands(kit, worker.id, run)).filter((command) =>
                leadCommand.test(command)
            );
        await writeEvidence({
            answerPosts: outcome.answerPosts,
            answered: outcome.answered,
            callers: outcome.callers,
            firstAgentId: first.id,
            firstLeadCommands: await leadCommands(first, firstRun),
            leads,
            mcpCalls: mcp.calls,
            posts: { channel: posts },
            questionMessageId: question.id,
            scenario: 'heartbeat-lead-dedupe',
            secondAgentId: second.id,
            secondLeadCommands: await leadCommands(second, secondRun),
            stamp: kit.stamp,
        });

        log('checking gates');
        expect(firstRun.status, 'first heartbeat turn status').toBe('completed');
        expect(secondRun.status, 'second heartbeat turn status').toBe('completed');
        expect(outcome.answered, 'an Agent answered the question with the record facts').toBe(true);
        expect(outcome.callers, 'Agents that searched the pricing notes').toHaveLength(1);
        expect(outcome.answerPosts, 'answer posts about the question').toHaveLength(1);
    } finally {
        for (const connectionId of connectionIds) {
            await kit
                .trpc('mcp.delete', { connectionId, serverId: kit.serverId })
                .catch(() => undefined);
        }
        await mcp.close();
    }
}
