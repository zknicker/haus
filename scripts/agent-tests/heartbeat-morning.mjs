// The nightly-to-morning heartbeat scenario (specs/heartbeat.md#evals): the production
// path from a nightly report to the post people read. A nightly run finds an aging
// risk nobody asked about in a watched ledger, the report run posts nothing and
// schedules a morning reminder, the dev-only `dev.fireReminderNow` route fires it
// now, and the morning turn posts once.
//
// The morning post is gated on its own text (`morningPostReadsAlone`): readers may
// never see the reminder title, its description, or the reply line, so the post
// must open with a heads-up line, name the finding, and say why it matters now.

import {
    agentPosts,
    canaryRule,
    describeAgent,
    renderMemory,
    runReasoning,
    seedMessages,
    writeEvidence,
    writeMemory,
} from './heartbeat.mjs';
import { baselineRecords, withLedger } from './heartbeat-daytime.mjs';
import { opensWithHeadsUp } from './heartbeat-standing.mjs';

const scenario = 'heartbeat-nightly-report-morning-post';
const operatorZone = 'America/Chicago';
const findingMentions = /ORD-7002|certificate|\bcert\b|\bTLS\b/iu;
const leansOnHiddenContext = /\breminder\b|\bas (?:promised|mentioned|planned)\b/iu;

/** Why a morning post fails to read right on its own; empty when it passes. */
export function morningPostReadsAlone(text, { finding, whyNow }) {
    const post = String(text ?? '');
    const first = post
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    const failures = [];
    if (!opensWithHeadsUp(post) || leansOnHiddenContext.test(first ?? '')) {
        failures.push('opens with a heads-up line');
    }
    if (!finding.test(post)) {
        failures.push('names the finding');
    }
    if (!whyNow.test(post)) {
        failures.push('says why it matters now');
    }
    if (leansOnHiddenContext.test(post)) {
        failures.push('does not lean on the reminder');
    }
    return failures;
}

export async function runNightlyReportMorningPost({ agents, expect, kit, log }) {
    const [worker] = agents;
    const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const weekday = expiry.toLocaleDateString('en-US', { timeZone: operatorZone, weekday: 'long' });
    const whyNow = new RegExp(
        `expir\\w*|${weekday}|\\b\\d+ days?\\b|this week|outage|checkout|payments? (?:fail|break|stop)`,
        'iu'
    );
    const riskRecord = [
        'ORD-7002',
        {
            opened: 'Monday',
            owner: 'Ops',
            status: 'renewal unassigned since Monday',
            title: `Payment gateway TLS certificate expires ${weekday}; checkout fails once it lapses`,
        },
    ];
    const previous = await kit.trpc('dev.setOperatorTimezone', {
        serverId: kit.serverId,
        timezone: operatorZone,
    });
    let reminder = null;
    try {
        await withLedger({ kit, log }, worker, [...baselineRecords, riskRecord], async (mcp) => {
            const channel = await kit.createChannel({ agentIds: [worker.id] });
            await writeMemory(kit, worker.id, ledgerMemory(worker, channel.name));
            log('seeding the day in the ledger channel');
            await seedMessages(kit, channel.id, [
                {
                    authorAgentId: worker.id,
                    content:
                        'Audit Ledger check: ORD-1001 to ORD-1003 routine, nothing needs anyone.',
                    minutesAgo: 420,
                },
                { content: 'Thanks.', minutesAgo: 410 },
            ]);
            const head = await kit.readHead(channel.id);
            const dmHead = await kit.readHead(worker.dmChatId);

            log('starting the nightly heartbeat');
            const run = await kit.startHeartbeat(worker.id, 'nightly');
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);
            const { reports } = await kit.heartbeatEvidence([worker.id]);
            const nightPosts = {
                channel: await agentPosts(kit, channel.id, worker.id, head),
                dm: await agentPosts(kit, worker.dmChatId, worker.id, dmHead),
            };
            const reminders = (
                await kit.trpc('reminder.list', {
                    agentId: worker.id,
                    serverId: kit.serverId,
                    status: 'scheduled',
                })
            ).filter((entry) => entry.ownerAgentId === worker.id);
            reminder = reminders[0] ?? null;
            const evidence = {
                agent: await describeAgent(kit, worker),
                heartbeatReasoning: await runReasoning(kit, worker.id, run),
                ledgerCalls: mcp.calls,
                nightPosts,
                reminders,
                reports,
                scenario,
                stamp: kit.stamp,
            };
            await writeEvidence(evidence);

            log('checking the night');
            expect(run.status, 'heartbeat turn status').toBe('completed');
            expect(mcp.calls.length > 0, 'the Agent looked at the ledger during the run').toBe(
                true
            );
            expect(reports, 'heartbeat reports queued for the main session').toHaveLength(1);
            expect(findingMentions.test(reports[0].content), 'the report names the risk').toBe(
                true
            );
            expect(nightPosts.channel, 'Agent posts in the channel overnight').toHaveLength(0);
            expect(nightPosts.dm, 'Agent posts in the Owner DM overnight').toHaveLength(0);
            expect(reminders, 'scheduled reminders owned by the Agent').toHaveLength(1);
            expect(reminder.anchorMessageId, 'the reminder is anchored to a message').toBeTruthy();
            expect(Date.parse(reminder.fireAt) > Date.now(), 'the reminder fires later').toBe(true);

            const anchorChatId = reminder.anchorChatId;
            if (anchorChatId !== channel.id && anchorChatId !== worker.dmChatId) {
                await kit.trackChat(anchorChatId);
            }
            const anchorHead = await kit.readHead(anchorChatId);
            const morningDmHead = await kit.readHead(worker.dmChatId);
            const morningChannelHead = await kit.readHead(channel.id);

            log('firing the morning reminder now');
            await kit.trpc('dev.fireReminderNow', {
                reminderId: reminder.id,
                serverId: kit.serverId,
            });
            const morning = await kit.settleTurn(worker.id, { startWithin: 90_000 });
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 180_000);
            const morningPosts = (await kit.readMessages(anchorChatId)).filter(
                (message) =>
                    message.sequence > anchorHead &&
                    message.author.kind === 'agent' &&
                    message.author.agentId === worker.id
            );
            const strayPosts = [
                ...(anchorChatId === channel.id
                    ? []
                    : await agentPosts(kit, channel.id, worker.id, morningChannelHead)),
                ...(anchorChatId === worker.dmChatId
                    ? []
                    : await agentPosts(kit, worker.dmChatId, worker.id, morningDmHead)),
            ];
            const [post] = morningPosts;
            const failures = post
                ? morningPostReadsAlone(post.content, { finding: findingMentions, whyNow })
                : [];
            await writeEvidence({
                ...evidence,
                morning: {
                    failures,
                    posts: morningPosts.map((message) => ({
                        cause: message.cause ?? null,
                        content: message.content,
                    })),
                    reasoning: await runReasoning(kit, worker.id, morning),
                    reminder: { description: reminder.description, title: reminder.title },
                    strayPosts,
                },
            });

            log('checking the morning');
            expect(morning.status, 'morning turn status').toBe('completed');
            expect(morningPosts, 'morning posts in the anchored chat').toHaveLength(1);
            expect(strayPosts, 'morning posts outside the anchored chat').toHaveLength(0);
            expect(post.cause?.kind, 'the morning post is caused by the reminder').toBe('reminder');
            expect(post.cause?.automationId, 'the causing reminder').toBe(reminder.id);
            expect(post.cause?.fireId, 'the reminder fire attribution').toBeTruthy();
            expect(
                failures,
                `the post reads right on its own: ${JSON.stringify(post.content.slice(0, 240))}`
            ).toHaveLength(0);
            reminder = null;
        });
    } finally {
        await cancelIfScheduled(kit, reminder);
        await kit
            .trpc('dev.setOperatorTimezone', {
                serverId: kit.serverId,
                timezone: previous.previous,
            })
            .catch(() => undefined);
    }
}

async function cancelIfScheduled(kit, reminder) {
    if (!reminder) {
        return;
    }
    const rows = await kit
        .trpc('reminder.list', {
            agentId: reminder.ownerAgentId,
            serverId: kit.serverId,
            status: 'scheduled',
        })
        .catch(() => []);
    const current = rows.find((row) => row.id === reminder.id);
    if (current) {
        await kit
            .trpc('reminder.cancel', {
                commandId: `agent-tests-cleanup-${kit.stamp}`,
                expectedVersion: current.version,
                reminderId: current.id,
                serverId: kit.serverId,
            })
            .catch(() => undefined);
    }
}

function ledgerMemory(worker, channelName) {
    const baseline = baselineRecords
        .map(([key, record]) => `${key} ${record.title} (${record.status})`)
        .join('; ');
    return renderMemory({
        displayName: worker.displayName ?? worker.handle,
        keyKnowledge: [`Audit Ledger as last reviewed: ${baseline}. Any other record is new.`],
        role: `Ops watcher. You keep an eye on the Audit Ledger MCP connection for the team in #${channelName}.`,
        rules: [
            'Keep replies short; lead with the answer.',
            canaryRule,
            `Tell the team in #${channelName} about ledger records that need someone.`,
        ],
    });
}
