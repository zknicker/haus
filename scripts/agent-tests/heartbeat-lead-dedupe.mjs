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

/**
 * Outcome of one run from its channel posts (`agentPosts` returns message text
 * strings) and controlled-MCP calls. Only lookups of the pricing record count as
 * research on it.
 */
export function leadDedupeOutcome({ calls, posts }) {
    const answerPosts = posts.filter((post) => answerFacts.test(postText(post)));
    const callers = [
        ...new Set(
            calls
                .filter(
                    (call) => call.tool === 'lookup_audit_record' && call.key === pricingRecord[0]
                )
                .map((call) => call.caller)
                .filter(Boolean)
        ),
    ];
    return { answerPosts, answered: answerPosts.length > 0, callers };
}

function compactMessage(message) {
    return {
        author: message.author?.agentId ?? message.author?.kind ?? null,
        chatId: message.chatId,
        content: message.content,
        id: message.id,
        sequence: message.sequence,
    };
}

function postText(post) {
    return typeof post === 'string' ? post : (post?.content ?? '');
}

export async function runLeadDedupe({ agents, expect, kit, log }) {
    const [first, second] = agents;
    const mcp = await startControlledMcp();
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
                        'The Pricing Notes MCP connection holds the Q3 pricing page notes (record key DOC-Q3-PRICING); nothing else does.',
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

        const { leads, reports } = await kit.heartbeatEvidence([first.id, second.id]);
        // Duplicate work is a second finding sent up, not a glance at a source the Agent owns.
        const reporters = [
            ...new Set(
                reports
                    .filter((report) => answerFacts.test(report.content))
                    .map((report) => report.agentId)
            ),
        ];
        const posts = [
            ...(await agentPosts(kit, channel.id, first.id, head)),
            ...(await agentPosts(kit, channel.id, second.id, head)),
        ];
        const outcome = leadDedupeOutcome({ calls: mcp.calls, posts });
        // Every command of the heartbeat and report runs, so a failure shows what each did.
        const commands = (worker, run) =>
            journalCommands(kit, worker.id, run).catch((error) => [`unreadable: ${error}`]);
        await writeEvidence({
            answerPosts: outcome.answerPosts,
            answered: outcome.answered,
            callers: outcome.callers,
            channelMessages: (await kit.readMessages(channel.id)).map(compactMessage),
            firstAgentId: first.id,
            firstCommands: await commands(first, firstRun),
            leads,
            mcpCalls: mcp.calls,
            posts: { channel: posts },
            questionMessageId: question.id,
            reporters,
            reports,
            scenario: 'heartbeat-lead-dedupe',
            secondAgentId: second.id,
            secondCommands: await commands(second, secondRun),
            stamp: kit.stamp,
        });

        log('checking gates');
        expect(firstRun.status, 'first heartbeat turn status').toBe('completed');
        expect(secondRun.status, 'second heartbeat turn status').toBe('completed');
        expect(outcome.answered, 'an Agent answered the question with the record facts').toBe(true);
        expect(reporters, 'Agents that reported the pricing answer').toHaveLength(1);
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
