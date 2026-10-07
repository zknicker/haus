import { expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { nextReminderFireAt, parseReminderRepeat } from '../../../server/src/reminders/cadence.ts';
import { setWeeklyChannelArchived } from './cove-weekly-server-state.mjs';

// Included by the normal Computer suite; native model quota is explicitly opt-in.
// HAUS_RUN_COVE_WEEKLY_TEST=1 VARLOCK_ENV=test varlock run -- bun test <this-file>
const live = process.env.HAUS_RUN_COVE_WEEKLY_TEST === '1';
const withWeeklyCove = live
    ? (await import('./cove-weekly-live-fixture.mjs')).withWeeklyCove
    : null;
const fixture = live
    ? (await import('../../../server/test/agent-creation-fixture.ts')).agentCreationFixture()
    : null;
const liveTest = live ? test : test.skip;
const suitable =
    'Our launch owners and deliverables are set, and #product is the workstream I care about. The setup is going well. What is one useful next step for how we work together?';
const offer = (message) =>
    /(?:weekly|each week|every week|once a week)/iu.test(message) &&
    /(?:review|coordination|check.?in)/iu.test(message) &&
    /(?:\?|want|offer|would|shall|if helpful|i can|tell me|prefer)/iu.test(message);
const scheduled = (turn) =>
    turn.actions.filter(
        (action) => action.path === '/api/agent/reminders/schedule' && action.status === 200
    );
const noSchedule = (turn) =>
    expect(
        turn.actions.filter((action) =>
            /\/reminders\/(?:schedule|update|snooze|cancel)$/u.test(action.path)
        )
    ).toHaveLength(0);
const stateIs = (turn, state) =>
    expect((turn.notesAfter ?? '').replace(/[*`]/gu, '')).toMatch(
        new RegExp(`review_offer_state:\\s*${state}`, 'iu')
    );

liveTest(
    'Cove offers once and reconciles pending/uncertain delivery across resume',
    async () => {
        await withWeeklyCove(
            fixture,
            async (driver) => {
                await driver.clearConversation();
                const first = await driver.ask('never-offered', suitable);
                expect(first.messages.filter(offer)).toHaveLength(1);
                expect(first.messages.join('\n')).not.toMatch(/(?:daily|every day)/iu);
                noSchedule(first);
                stateIs(first, 'pending');

                await driver.resume();
                const pending = await driver.ask(
                    'pending-resumed',
                    'Explain briefly why independent verification belongs with its lane owner.',
                    {
                        newsBeforeSend:
                            'Please still answer that verification question; keep the answer brief.',
                    }
                );
                const hold = pending.actions.find((action) => action.result?.state === 'held');
                expect(hold?.result.shownMessages.map((message) => message.id)).toEqual([
                    pending.lateMessageId,
                ]);
                expect(pending.messages.filter(offer)).toHaveLength(0);
                noSchedule(pending);
                expect(pending.messages.length).toBeGreaterThan(0);

                // Confirmed server delivery with an uncertain local checkpoint.
                const notes = await readFile(driver.notes, 'utf8');
                await writeFile(
                    driver.notes,
                    `${notes.replace(/(review_offer_state:\s*)pending/u, '$1offered').replace(/^offer_send_status:.*$/gmu, '')}\noffer_send_status: uncertain\n`
                );
                await driver.resume();
                const uncertain = await driver.ask('uncertain-send-restart', suitable);
                expect(uncertain.messages.filter(offer)).toHaveLength(0);
                expect(uncertain.messages.length).toBeGreaterThan(0);
                noSchedule(uncertain);
            },
            { reportSuffix: 'offer-resume' }
        );
    },
    600_000
);

liveTest(
    'Cove suppresses declined/postponed offers and reconciles a delivered offer including custom guidance',
    async () => {
        await withWeeklyCove(
            fixture,
            async (driver) => {
                for (const state of ['declined', 'postponed', 'offered']) {
                    await driver.clearConversation();
                    await driver.seedState(state);
                    if (state === 'offered') {
                        const runner = await fixture.mintRunner(
                            'run_delivered_offer_seed',
                            driver.agentId,
                            fixture.channelId,
                            false
                        );
                        const text =
                            'Optional: I can provide quiet weekly #product coordination reviews. Would you like that?';
                        const delivered = await fixture.post('/api/agent/messages/send', runner, {
                            target: '#product',
                            content: text,
                            nonce: 'delivered-offer-seed',
                            done: true,
                        });
                        expect(delivered.body.state).toBe('sent');
                        await writeFile(
                            driver.notes,
                            `# Coordination\nreview_offer_state: offered\noffer_send_status: uncertain\noffer_destination: #product\noffer_timestamp: ${delivered.body.message.created_at}\noffer_text: ${text}\nThe local delivery receipt was lost. No consent yet.\n`
                        );
                    }
                    await driver.cold();
                    const result = await driver.ask(`persisted-${state}`, suitable);
                    expect(result.messages.filter(offer)).toHaveLength(0);
                    expect(result.messages.length).toBeGreaterThan(0);
                    noSchedule(result);
                    stateIs(result, state === 'offered' ? 'pending' : state);
                }
                await driver.clearConversation();
                await driver.seedState('declined');
                await writeFile(
                    `${driver.workspace}/notes/onboarding_playbook.md`,
                    '# Owner customization\nKeep launch work practical. Never overwrite this note.\n'
                );
                await driver.cold();
                const custom = await driver.ask('custom-conflict-declined', suitable, {
                    conflict: true,
                });
                expect(custom.messages.filter(offer)).toHaveLength(0);
                expect(custom.messages.length).toBeGreaterThan(0);
                noSchedule(custom);
                expect(
                    await readFile(`${driver.workspace}/notes/onboarding_playbook.md`, 'utf8')
                ).toContain('Never overwrite this note.');
            },
            { reportSuffix: 'persisted' }
        );
    },
    900_000
);

liveTest(
    'Cove installs one consented review and preserves its receipt across resume',
    async () => {
        await withWeeklyCove(
            fixture,
            async (driver) => {
                await driver.clearConversation();
                await driver.seedState('pending');
                const accepted = await driver.ask(
                    'accepted',
                    'Yes, I agree to a quiet weekly review of #product every Friday at 09:00 America/New_York. Post only new actionable findings in #product, at most three in one message. Schedule it now and confirm once.'
                );
                expect(scheduled(accepted).length).toBeGreaterThan(0);
                stateIs(accepted, 'enabled');
                expect(accepted.messages).toHaveLength(1);
                const rows = await fixture.harness
                    .sql`select id, repeat, timezone, fire_at from reminders where server_id=${fixture.serverId} and status='scheduled'`;
                expect(rows).toHaveLength(1);
                expect(rows[0].repeat).toBe('weekly:fri@09:00');
                expect(rows[0].timezone).toBe('America/New_York');
                expect(
                    new Intl.DateTimeFormat('en-US', {
                        timeZone: rows[0].timezone,
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        hourCycle: 'h23',
                    }).format(new Date(rows[0].fire_at))
                ).toBe('Fri 09:00');
                expect(
                    new Date(
                        nextReminderFireAt(
                            parseReminderRepeat(rows[0].repeat),
                            Date.parse('2026-10-30T13:00:00Z'),
                            rows[0].timezone
                        )
                    ).toISOString()
                ).toBe('2026-11-06T14:00:00.000Z');
                await driver.resume();
                const enabled = await driver.ask(
                    'enabled-restart',
                    'Please verify our current review agreement after restarting. Keep the agreed cadence; do not start another review.'
                );
                expect(enabled.messages.filter(offer)).toHaveLength(0);
                noSchedule(enabled);
                const after = await fixture.harness
                    .sql`select id, repeat, timezone, fire_at from reminders where server_id=${fixture.serverId} and status='scheduled'`;
                expect(after).toEqual(rows);
            },
            { reportSuffix: 'receipt' }
        );
    },
    600_000
);

liveTest(
    'a proven refused offer retries once at the next suitable interaction',
    async () => {
        await withWeeklyCove(
            fixture,
            async (driver) => {
                await driver.clearConversation();
                const refused = await driver.ask('offer-refused', suitable, { refuseOffer: true });
                expect(
                    refused.actions.some(
                        (action) =>
                            action.path === '/api/agent/messages/send' && action.status === 409
                    )
                ).toBe(true);
                expect(refused.messages.filter(offer)).toHaveLength(0);
                noSchedule(refused);
                stateIs(refused, 'offered');
                await setWeeklyChannelArchived(fixture, false);
                await driver.resume();
                const recovered = await driver.ask('offer-retry', suitable);
                expect(recovered.messages.filter(offer)).toHaveLength(1);
                stateIs(recovered, 'pending');
                noSchedule(recovered);
                await driver.resume();
                const again = await driver.ask('offer-after-retry', suitable);
                expect(again.messages.filter(offer)).toHaveLength(0);
                noSchedule(again);
            },
            { reportSuffix: 'offer-refused' }
        );
    },
    600_000
);
