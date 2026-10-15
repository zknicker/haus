import type { ExecutionJournalUploadRecord } from '@haus/api';
import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { assertOpaqueId, attachComputer, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('live turn retains open tool evidence and scroll through refresh, reasoning, and reconnect', async ({
    page,
}) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Live turn',
        slug: 'live-turn',
    });
    const credential = 'computer-live-turn-credential-12';
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
        const runId = 'run_liveturntrace001';
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
            values ('aev_liveturntrace001', '${server.id}', '${agent.id}', '${runId}', 1, 1,
                'server', 'server', 1, 'starting_work', 'started', '${startedAt}');
        `
        );

        // The fake Computer syncs the run's journal the way a real one does;
        // the App reads only what the Server stored (ADR 0048).
        let sequence = 0;
        const upload = async (records: ExecutionJournalUploadRecord[]) => {
            const throughSequence = sequence + records.length;
            const acked = new Promise<void>((resolve) => {
                const onAck = (event: { data: unknown }) => {
                    const frame = JSON.parse(String(event.data));
                    if (
                        frame.type === 'agent-execution-journal-ack' &&
                        frame.throughSequence === throughSequence
                    ) {
                        expect(frame.status).toBe('stored');
                        computer.removeEventListener('message', onAck);
                        resolve();
                    }
                };
                computer.addEventListener('message', onAck);
            });
            computer.send(
                JSON.stringify({
                    agentId: agent.id,
                    records: records.map((record) => ({ record, sequence: ++sequence })),
                    runId,
                    runStartedAt: startedAt,
                    type: 'agent-execution-journal-records',
                })
            );
            await acked;
        };
        await upload([
            { document: { runId, startedAt, status: 'running', tools: [] }, type: 'open' },
            {
                block: { id: 'thought', startedAt, text: 'Inspecting the active queue.' },
                type: 'reasoning',
            },
            ...Array.from(
                { length: 24 },
                (_, index): ExecutionJournalUploadRecord => ({
                    tool: {
                        toolCallId: `call_${index}`,
                        toolName: 'bash',
                        startedAt: new Date(now.getTime() - 70_000 + index * 1000).toISOString(),
                        endedAt: new Date(now.getTime() - 69_500 + index * 1000).toISOString(),
                        status: 'completed',
                        // One-line shell calls fold into one row; multi-line scripts keep a row
                        // each, so the log is tall enough to scroll and call_2 stands alone.
                        input: { command: `cd /tmp\necho inspection-${index}` },
                        output: `Evidence ${index}`,
                    },
                    type: 'tool',
                })
            ),
        ]);
        // The running turn opens on arrival; its header is the Disclosure trigger.
        const turnHeader = page.locator(
            `[data-log-turn="${runId}"] [data-log-header][aria-expanded]`
        );
        await page.goto(`/s/live-turn/agents/${agent.id}/activity`);
        await expect(turnHeader).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByText('Inspecting the active queue.', { exact: true })).toBeVisible();
        const inspected = page.locator('[data-trace-anchor="tool:call_2"]');
        const trigger = inspected.getByRole('button').first();
        await trigger.click();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(inspected).toContainText('Evidence 2');
        await inspected.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        const before = await inspected.boundingBox();
        expect(before).not.toBeNull();
        await inspected.evaluate((element) => {
            element.setAttribute('data-inspected-instance', 'retained');
        });

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
        await upload([
            {
                input: { command: 'cd /tmp\necho late-arriving-evidence' },
                occurredAt: new Date(now.getTime() - 70_500).toISOString(),
                toolCallId: 'call_late',
                toolName: 'bash',
                type: 'tool-call',
            },
            {
                isError: false,
                occurredAt: new Date(now.getTime() - 70_400).toISOString(),
                output: 'Late evidence',
                preliminary: false,
                toolCallId: 'call_late',
                toolName: 'bash',
                type: 'tool-result',
            },
            {
                id: 'thought',
                text:
                    '\n\n' +
                    'Additional reasoning arrives above the inspected tool.\n\n'.repeat(12),
                type: 'reasoning-append',
            },
        ]);
        await expect(page.getByText('Loading detailed activity...', { exact: true })).toHaveCount(
            0
        );
        // A collapsed thought previews its paragraphs on one line, so match a substring.
        await expect(
            page.getByText('Additional reasoning arrives above the inspected tool.').first()
        ).toBeAttached();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(inspected).toHaveAttribute('data-inspected-instance', 'retained');
        await expect(page.locator('[data-trace-anchor="tool:call_late"]')).toBeAttached();
        await expect
            .poll(async () => Math.abs((await inspected.boundingBox())!.y - before!.y))
            .toBeLessThan(2);

        const beforeHumanScroll = (await inspected.boundingBox())!.y;
        await inspected.hover();
        await page.mouse.wheel(0, 160);
        await expect
            .poll(async () => beforeHumanScroll - (await inspected.boundingBox())!.y)
            .toBeGreaterThan(80);

        // Reasoning changes without a semantic activity event still reach the
        // open view: the Server announces each stored change.
        const latestAt = new Date().toISOString();
        await upload([
            { id: 'latest', startedAt: latestAt, type: 'reasoning-start' },
            {
                id: 'latest',
                text: 'The latest reasoning is now visible.',
                type: 'reasoning-append',
            },
        ]);
        await expect(
            page.getByText('The latest reasoning is now visible.', { exact: true })
        ).toBeAttached();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        // A change stored while the App is offline arrives after it reconnects.
        await page.context().setOffline(true);
        await expect(inspected).toHaveAttribute('data-inspected-instance', 'retained');
        await upload([
            { id: 'latest', endedAt: new Date().toISOString(), type: 'reasoning-end' },
            { id: 'offline', startedAt: new Date().toISOString(), type: 'reasoning-start' },
            { id: 'offline', text: 'Stored while the App was offline.', type: 'reasoning-append' },
        ]);
        await page.context().setOffline(false);
        await expect(
            page.getByText('Stored while the App was offline.', { exact: true })
        ).toBeAttached();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(inspected).toHaveAttribute('data-inspected-instance', 'retained');
        await page.screenshot({ path: test.info().outputPath('live-turn.png') });
        await page.reload();
        await expect(turnHeader).toHaveAttribute('aria-expanded', 'true');
        await expect(
            page.getByText('The latest reasoning is now visible.', { exact: true })
        ).toBeAttached();
    } finally {
        computer.close();
    }
});
