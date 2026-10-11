// "Wake me when CI fails": with a bound Haus GitHub App installation, the Agent
// creates a `github` Trigger (no webhook, no URL, no secret) filtered to
// failures, and posts no Trigger secret anywhere. Opt-in: it needs this dev
// stack's GitHub connection signed in with at least one active installation
// bound (specs/github-app-connection.md#installations).

import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An Agent asked to be woken when CI fails creates one github Trigger on the bound installation, listening to a CI event filtered to failure, creates no webhook Trigger, and posts no Trigger secret in any Chat.',
    name: 'github-trigger-ci-failure',
    optIn: true,
    async run({ agents, expect, kit, log, settleTurn }) {
        const [worker] = agents;
        const { connection, installation } = await requireBoundInstallation(kit);
        let created = [];

        try {
            await kit.trpc('mcp.setGrant', {
                agentId: worker.id,
                connectionId: connection.id,
                enabled: true,
                serverId: kit.serverId,
            });
            const channel = await kit.createChannel({ agentIds: [worker.id] });

            log(`asking for a CI wake on ${installation.account.login}`);
            await kit.harness.send(
                channel.id,
                `@${worker.handle} Wake me when CI fails on main anywhere in the ${installation.account.login} GitHub org, and post the failing workflow here when it happens.`
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
            expect(github[0].github.installationId, 'Trigger installation').toBe(installation.id);
            const ciEvents = github[0].github.events.filter((entry) =>
                ['workflow_run', 'workflow_job', 'check_suite', 'check_run'].includes(entry.event)
            );
            expect(ciEvents.length > 0, 'a CI event on the Trigger').toBe(true);
            expect(
                ciEvents.every((entry) => entry.conclusions?.includes('failure')),
                'every CI event filtered to failure'
            ).toBe(true);

            const page = await kit.trpc('chat.messages', {
                chatId: channel.id,
                limit: 100,
                serverId: kit.serverId,
            });
            const written = kit.authoredBy(page.messages, worker.id);
            for (const thread of page.threads ?? []) {
                written.push(
                    ...kit.authoredBy(await kit.readMessages(thread.threadChatId), worker.id)
                );
            }
            expect(written.length > 0, 'the worker confirmed').toBe(true);
            expect(
                written.filter((content) => /grtt_/u.test(content)),
                'messages carrying a Trigger secret'
            ).toHaveLength(0);
        } finally {
            for (const trigger of created) {
                await kit
                    .trpc('trigger.delete', { serverId: kit.serverId, triggerId: trigger.id })
                    .catch(() => undefined);
            }
            await kit
                .trpc('mcp.setGrant', {
                    agentId: worker.id,
                    connectionId: connection.id,
                    enabled: false,
                    serverId: kit.serverId,
                })
                .catch(() => undefined);
        }
    },
});

async function requireBoundInstallation(kit) {
    const connections = await kit.trpc('mcp.list', { serverId: kit.serverId });
    const connection = connections.find((entry) => entry.preset === 'github' && entry.connected);
    if (!connection) {
        throw new Error(
            'github-trigger-ci-failure needs a connected GitHub connection on this dev stack: sign in under Settings → Connections → GitHub.'
        );
    }
    const installations = await kit.trpc('github.installations', {
        connectionId: connection.id,
        serverId: kit.serverId,
    });
    const installation = installations.find((entry) => entry.status === 'active');
    if (!installation) {
        throw new Error(
            'github-trigger-ci-failure needs an active Haus Dev installation bound to the GitHub connection.'
        );
    }
    return { connection, installation };
}
