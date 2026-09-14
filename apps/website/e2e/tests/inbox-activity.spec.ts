import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { assertOpaqueId, attachComputer, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Inbox elapsed time ticks through activity changes and reloads', async ({ page }) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Activity clock',
        slug: 'activity-clock',
    });
    const credential = 'computer-activity-clock-credential-12';
    const { computerId } = await attachComputer(client, { credential, slug: server.slug });
    const computer = new WebSocket(
        `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
    );
    await socketOpen(computer);
    const accepted = socketMessage(computer);
    sendBootstrap(computer, credential, 'complete');
    await accepted;
    try {
        const inventory = {
            runtimes: [
                { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] },
            ],
        };
        runPsql(
            session.databaseUrl,
            `update computers set reported_inventory = '${JSON.stringify(inventory)}'::jsonb where id = '${computerId}'`
        );
        const { agent } = await client.agent.create.mutate({
            serverId: server.id,
            computerId,
            displayName: 'Scout',
            handle: 'scout',
            runtimeId: 'codex',
            modelId: 'gpt-5.6-sol',
        });
        const chatId = server.channels.find((channel) => channel.name === 'all')?.id;
        assertOpaqueId(chatId);
        const now = new Date();
        const startedAt = new Date(now.getTime() - 83_000).toISOString();
        const runId = 'run_activityclock001';
        runPsql(
            session.databaseUrl,
            `
            insert into agent_delivery (agent_id, server_id, active_run_id, active_run_chat_id,
                active_run_computer_id, active_run_runtime_id, active_run_model_id,
                active_run_reasoning_effort, accepted_at, dispatched_at)
            values ('${agent.id}', '${server.id}', '${runId}', '${chatId}', '${computerId}',
                'codex', 'gpt-5.6-sol', 'medium', '${startedAt}', '${startedAt}')
            on conflict (agent_id) do update set active_run_id = excluded.active_run_id,
                active_run_chat_id = excluded.active_run_chat_id,
                active_run_computer_id = excluded.active_run_computer_id,
                active_run_runtime_id = excluded.active_run_runtime_id,
                active_run_model_id = excluded.active_run_model_id,
                active_run_reasoning_effort = excluded.active_run_reasoning_effort,
                accepted_at = excluded.accepted_at, dispatched_at = excluded.dispatched_at;
            insert into agent_activity (id, server_id, agent_id, run_id, run_order, position,
                producer, producer_id, producer_sequence, category, phase, occurred_at)
            values ('aev_activityclock001', '${server.id}', '${agent.id}', '${runId}', 1, 1,
                'server', 'server', 1, 'starting_work', 'started', '${startedAt}');
        `
        );
        await page.goto('/s/activity-clock/inbox');
        const row = page.getByRole('button', { name: 'Scout', exact: true });
        await expect(row).toContainText(/1m \d+s elapsed/u);
        const firstLabel = await row.innerText();
        await expect.poll(() => row.innerText(), { timeout: 2500 }).not.toBe(firstLabel);
        computer.send(
            JSON.stringify({
                type: 'agent-activity',
                agentId: agent.id,
                runId,
                producerSequence: 1,
                category: 'using_tool',
                phase: 'started',
                toolRef: 'browser',
                occurredAt: now.toISOString(),
            })
        );
        await expect(row).toContainText('Using browser');
        await expect(row).toContainText(/1m \d+s elapsed/u);
        computer.send(
            JSON.stringify({
                type: 'agent-activity',
                agentId: agent.id,
                runId,
                producerSequence: 2,
                category: 'using_tool',
                phase: 'completed',
                occurredAt: now.toISOString(),
            })
        );
        await expect(row).toContainText('Working');
        await expect(row).toContainText(/1m \d+s elapsed/u);
        await page.reload();
        await expect(row).toContainText('Working');
        await expect(row).toContainText(/1m \d+s elapsed/u);
    } finally {
        computer.close();
    }
});
