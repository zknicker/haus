// A `github` Trigger fires on a failed CI run: the owning Agent answers the
// fire once, top level in the anchor channel (not in a Thread), and names the
// fire with `haus message send --cause <fireId>`. The installation is seeded on
// the stack's own Server and the delivery is signed with the stack's App
// webhook secret and POSTed to /api/github/webhook, as GitHub would
// (scripts/agent-tests/github-world.mjs, specs/github-triggers.md#endpoint).

import { createAgentGithubTrigger, githubAccount, seedGithubWorld } from '../github-world.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'When a github Trigger fires on a failed workflow_run, the fire is recorded and the owning Agent posts exactly one top-level message in the anchor channel, sent with --cause naming that fire, and nothing else anywhere in the channel or its Threads.',
    name: 'github-trigger-fire-reply',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const world = await seedGithubWorld(kit, worker);
        const workflow = `Release Gate ${marker('').slice(0, 4)}`;
        let trigger = null;

        try {
            const channel = await kit.createChannel({ agentIds: [worker.id] });
            // A plain FYI, so the worker has no reason to author a Trigger of its own.
            const anchor = await kit.trpc('chat.send', {
                chatId: channel.id,
                content: `Release log ${kit.stamp}: shipping the ${githubAccount} release from main today.`,
                nonce: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
                serverId: kit.serverId,
            });
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);

            log('creating the github Trigger on the anchor message');
            const created = await createAgentGithubTrigger(kit, {
                agentId: worker.id,
                chatId: channel.id,
                github: {
                    events: [
                        {
                            actions: ['completed'],
                            branches: ['main'],
                            conclusions: ['failure'],
                            event: 'workflow_run',
                        },
                    ],
                    installationRowId: world.installationRowId,
                    repositories: { scope: 'installation' },
                },
                instruction:
                    'Tell the channel which workflow failed, on which branch and repository.',
                messageId: anchor.message.id,
                title: `CI failed on main in ${githubAccount}`,
            });
            const triggers = await kit.trpc('trigger.list', {
                agentId: worker.id,
                serverId: kit.serverId,
            });
            trigger = triggers.find((entry) => entry.id === created?.trigger?.id) ?? null;
            expect(trigger?.anchorChatId, 'Trigger anchor chat').toBe(channel.id);
            expect(triggers, 'Triggers the worker owns before the fire').toHaveLength(1);
            const head = await kit.readHead(channel.id);

            log(`posting a failed ${workflow} run`);
            const settling = settleTurn(worker.id, { startWithin: 60_000 });
            await wait(1000);
            const delivery = await world.postDelivery('workflow_run', workflowRun(world, workflow));
            expect(delivery.status, 'webhook delivery status').toBe(202);
            expect(delivery.body?.routed, 'Triggers the delivery routed to').toBe(1);
            const turn = await settling;
            expect(turn.status, 'fire turn status').toBe('completed');
            expect(turn.failureKind ?? 'none', 'fire turn failure kind').toBe('none');

            log('checking gates');
            const fires = await kit.trpc('trigger.runs', {
                serverId: kit.serverId,
                triggerId: trigger.id,
            });
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

            const causeSends = await causeSendsFor(kit, worker.id, turn, fireId);
            expect(
                causeSends.length > 0,
                'a journaled haus message send carrying --cause <fireId>'
            ).toBe(true);
        } finally {
            const owned = await kit
                .trpc('trigger.list', { agentId: worker.id, serverId: kit.serverId })
                .catch(() => (trigger ? [trigger] : []));
            for (const entry of owned) {
                await kit
                    .trpc('trigger.delete', { serverId: kit.serverId, triggerId: entry.id })
                    .catch(() => undefined);
            }
            await world.cleanup();
        }
    }),
});

/** A completed, failed workflow run on main, shaped like GitHub's payload. */
function workflowRun(world, name) {
    const path = `.github/workflows/${name.toLowerCase().replaceAll(' ', '-')}.yml`;
    const sha = 'acb5820ced9479c074f688cc328bf03f341a511d';
    return {
        action: 'completed',
        workflow: { id: 161_335, name, path },
        workflow_run: {
            check_suite_id: 42,
            conclusion: 'failure',
            display_title: 'Bump the release version',
            event: 'push',
            head_branch: 'main',
            head_commit: { id: sha, message: 'Bump the release version' },
            head_sha: sha,
            html_url: `${world.repository.html_url}/actions/runs/30433642`,
            id: 30_433_642,
            name,
            path,
            pull_requests: [],
            run_attempt: 1,
            run_number: 562,
            status: 'completed',
            workflow_id: 161_335,
        },
    };
}

/**
 * `haus message send` commands naming the fire, across the settled turn's runs.
 * Journals sync asynchronously, so an unavailable journal is retried, and the
 * gate asserts at least one send so an empty journal cannot pass it.
 */
async function causeSendsFor(kit, agentId, turn, fireId, { attempts = 10, delayMs = 3000 } = {}) {
    const commands = [];
    for (const runId of turn.runIds ?? [turn.runId]) {
        let result = null;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            result = await kit.trpc('agent.executionJournal', {
                agentId,
                runId,
                serverId: kit.serverId,
            });
            if (result.status === 'available') {
                break;
            }
            await wait(delayMs);
        }
        if (result?.status !== 'available') {
            throw new Error(
                `Execution journal for run ${runId} stayed ${result?.status ?? 'unreadable'} after ${attempts} tries.`
            );
        }
        commands.push(...result.journal.tools.map((tool) => String(tool.input?.command ?? '')));
    }
    return commands.filter(
        (command) =>
            /\bmessage\s+send\b/u.test(command) &&
            /--cause[\s=]/u.test(command) &&
            command.includes(fireId)
    );
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
