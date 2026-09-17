import type { AgentExecutionJournal, AgentExecutionJournalRequest } from '@haus/api';
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

        let journal: AgentExecutionJournal = {
            runId,
            startedAt,
            status: 'running',
            reasoning: [{ id: 'thought', startedAt, text: 'Inspecting the active queue.' }],
            tools: Array.from({ length: 24 }, (_, index) => ({
                toolCallId: `call_${index}`,
                toolName: 'bash',
                startedAt: new Date(now.getTime() - 70_000 + index * 1000).toISOString(),
                endedAt: new Date(now.getTime() - 69_500 + index * 1000).toISOString(),
                status: 'completed',
                input: { command: `echo inspection-${index}` },
                output: `Evidence ${index}`,
            })),
        };
        let hold = false;
        let requests = 0;
        const queued: AgentExecutionJournalRequest[] = [];
        const reply = (request: AgentExecutionJournalRequest) =>
            computer.send(
                JSON.stringify({
                    type: 'agent-execution-journal-result',
                    status: 'available',
                    agentId: agent.id,
                    requestId: request.requestId,
                    runId,
                    journal,
                })
            );
        computer.addEventListener('message', (event) => {
            const request = JSON.parse(String(event.data));
            if (request.type !== 'agent-execution-journal-request') {
                return;
            }
            requests++;
            if (hold) {
                queued.push(request);
            } else {
                reply(request);
            }
        });
        await page.goto(`/s/live-turn/agents/${agent.id}/activity`);
        await page.locator('.accordion__trigger').click();
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

        hold = true;
        const previousRequests = requests;
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
        await expect.poll(() => requests).toBeGreaterThan(previousRequests);
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByText('Loading detailed activity...', { exact: true })).toHaveCount(
            0
        );
        await expect(inspected).toHaveAttribute('data-inspected-instance', 'retained');
        journal = {
            ...journal,
            tools: [
                ...journal.tools,
                {
                    toolCallId: 'call_late',
                    toolName: 'bash',
                    status: 'completed',
                    startedAt: new Date(now.getTime() - 70_500).toISOString(),
                    input: { command: 'echo late-arriving-evidence' },
                    output: 'Late evidence',
                },
            ],
            reasoning: [
                {
                    id: 'thought',
                    startedAt,
                    text:
                        'Inspecting the active queue.\n\n' +
                        'Additional reasoning arrives above the inspected tool.\n\n'.repeat(12),
                },
            ],
        };
        hold = false;
        for (const request of queued.splice(0)) {
            reply(request);
        }
        await expect(
            page
                .getByText('Additional reasoning arrives above the inspected tool.', {
                    exact: true,
                })
                .first()
        ).toBeAttached();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(inspected).toHaveAttribute('data-inspected-instance', 'retained');
        await expect(page.locator('[data-trace-anchor="tool:call_late"]')).toBeAttached();
        await expect
            .poll(async () => Math.abs((await inspected.boundingBox())!.y - before!.y))
            .toBeLessThan(2);

        // Reasoning changes without a semantic activity event still reach the open view.
        journal = {
            ...journal,
            reasoning: [
                ...journal.reasoning!,
                {
                    id: 'latest',
                    startedAt: new Date().toISOString(),
                    text: 'The latest reasoning is now visible.',
                },
            ],
        };
        await expect(
            page.getByText('The latest reasoning is now visible.', { exact: true })
        ).toBeAttached();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await page.context().setOffline(true);
        await expect(inspected).toHaveAttribute('data-inspected-instance', 'retained');
        const beforeReconnect = requests;
        await page.context().setOffline(false);
        await expect.poll(() => requests).toBeGreaterThan(beforeReconnect);
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(inspected).toHaveAttribute('data-inspected-instance', 'retained');
        await page.screenshot({ path: test.info().outputPath('live-turn.png') });
        await page.reload();
        await page.locator('.accordion__trigger').click();
        await expect(
            page.getByText('The latest reasoning is now visible.', { exact: true })
        ).toBeAttached();
        await page.locator('.accordion__trigger').click();
        await page.waitForTimeout(1200);
        const closedRequests = requests;
        await page.waitForTimeout(1200);
        expect(requests).toBe(closedRequests);
    } finally {
        computer.close();
    }
});
