import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';

const live = process.env.HAUS_RUN_COVE_WEEKLY_TEST === '1';
const liveTest = live ? test : test.skip;
const withWeeklyCove = live
    ? (await import('./cove-weekly-live-fixture.mjs')).withWeeklyCove
    : null;
const fixture = live
    ? (await import('../../../server/test/agent-creation-fixture.ts')).agentCreationFixture()
    : null;

for (const { quiet, refresh, ordinary } of [
    { quiet: false, refresh: false, ordinary: false },
    { quiet: true, refresh: false, ordinary: false },
    { quiet: true, refresh: true, ordinary: false },
    { quiet: false, refresh: false, ordinary: true },
]) {
    liveTest(
        `scheduler wake: ${ordinary ? 'ordinary Agent' : 'Cove'}, ${quiet ? 'quiet review' : 'one-shot'}, refresh=${refresh}`,
        async () => {
            await withWeeklyCove(
                fixture,
                async (driver) => {
                    await driver.clearConversation();
                    await fixture.harness
                        .sql`update agents set factory_applied_at=coalesce(factory_applied_at,now()),desired_model_id=${driver.model} where id=${driver.agentId}`;
                    const scenario = `${ordinary}-${quiet}-${refresh}`;
                    const instruction = quiet
                        ? 'Review #product coordination'
                        : 'Checkpoint SYNTHETIC_CHECKPOINT_37';
                    if (!ordinary && quiet) {
                        await writeFile(
                            driver.notes,
                            '# Coordination\nreview_offer_state: enabled\nAgreed scope and destination: #product. Weekly review: quiet for unchanged or healthy state; report only new actionable findings. Last baseline: no tasks, blockers or outstanding decisions. Do not infer bad performance from an idle Agent.\n'
                        );
                    }
                    const anchor = await fixture.owner.trpc.chat.send.mutate({
                        chatId: fixture.channelId,
                        content: instruction,
                        nonce: `wake-anchor-${scenario}`,
                        serverId: fixture.serverId,
                    });
                    const runner = await fixture.mintRunner(
                        `run_wake_seed_${scenario}`,
                        driver.agentId,
                        fixture.channelId,
                        false
                    );
                    const fireAt = new Date(Date.now() + 3_600_000).toISOString();
                    const response = await fetch(
                        new URL('/api/agent/reminders/schedule', fixture.harness.url),
                        {
                            method: 'POST',
                            headers: {
                                authorization: `Bearer ${runner.token}`,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                commandId: `wake-${scenario}`,
                                messageId: anchor.message.id,
                                fireAt,
                                title: quiet ? 'Product review' : 'Checkpoint',
                                ...(quiet ? { repeat: 'every:7d' } : {}),
                                description: instruction,
                            }),
                        }
                    );
                    expect(response.status).toBe(200);
                    const { connectHausDatabase } = await import(
                        '../../../server/src/postgres/connection.ts'
                    );
                    const { tickReminders } = await import(
                        '../../../server/src/reminders/scheduler.ts'
                    );
                    const { AgentDelivery } = await import(
                        '../../../server/src/agent-delivery/delivery.ts'
                    );
                    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
                    const frames = [];
                    const delivery = new AgentDelivery(connection.db, {
                        isOnline: () => true,
                        send: (_id, frame) => {
                            frames.push(frame);
                            return true;
                        },
                    });
                    await fixture.harness
                        .sql`update agent_delivery set active_run_id=null,active_run_chat_id=null,active_run_computer_id=null,active_run_runtime_id=null,active_run_model_id=null,active_run_reasoning_effort=null,accepted_at=null,dispatched_at=null where server_id=${fixture.serverId}`;
                    await fixture.harness
                        .sql`delete from agent_inbox where server_id=${fixture.serverId} and source <> 'reminder'`;
                    const clock = { now: () => new Date(new Date(fireAt).getTime() + 1000) };
                    try {
                        await tickReminders(connection.db, clock, delivery);
                        const frame = frames.find(
                            (candidate) =>
                                candidate.type === 'start' && candidate.agentId === driver.agentId
                        );
                        expect(frame).toBeDefined();
                        await delivery.onAck({ agentId: driver.agentId, runId: frame.runId });
                        const turn = await driver.fire(frame, { refresh });
                        const sent = turn.actions.filter(
                            (action) =>
                                action.path === '/api/agent/messages/send' &&
                                action.result?.state === 'sent'
                        );
                        expect(sent).toHaveLength(quiet ? 0 : 1);
                        if (!quiet) {
                            expect(sent[0].body.target).toBe('#product');
                            expect(sent[0].body.replyTo ?? null).toBeNull();
                            const fireId = frame.inbox[0].content.match(/^fire=(\S+)/mu)?.[1];
                            expect(fireId).toBeTruthy();
                            const [cause] = await fixture.harness
                                .sql`select reminder_fire_id from message_causes where message_id=${sent[0].result.message.id}`;
                            expect(cause.reminder_fire_id).toBe(fireId);
                            expect(sent[0].result.message.content).toMatch(/checkpoint/iu);
                        }
                        await delivery.onTurnSettled(fixture.computerId, {
                            agentId: driver.agentId,
                            runId: frame.runId,
                            startedAt: new Date().toISOString(),
                            endedAt: new Date().toISOString(),
                            status: 'completed',
                            summary: turn.finalText,
                            outputProduced: sent.length > 0,
                            messageCount: sent.length,
                            modelId: driver.model,
                            runtimeId: 'codex',
                            tokenUsage: null,
                            activity: { operations: [] },
                        });
                        const remaining = await fixture.harness
                            .sql`select id from reminder_agent_attention where agent_id=${driver.agentId}`;
                        expect(remaining).toHaveLength(0);
                        expect((await tickReminders(connection.db, clock, delivery)).fired).toBe(0);
                    } finally {
                        await connection.close();
                    }
                },
                {
                    reportSuffix: `wake-${ordinary ? 'ordinary' : 'cove'}-${quiet ? 'quiet' : 'one-shot'}-${refresh}`,
                    ordinary,
                }
            );
        },
        600_000
    );
}
