import { expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { nextReminderFireAt, parseReminderRepeat } from '../../../server/src/reminders/cadence.ts';

// Normal suite discovers these; external model calls require explicit opt-in.
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
    'custom Cove discovers the offer protocol without overwriting guidance',
    async () => {
        await withWeeklyCove(
            fixture,
            async (driver) => {
                await driver.clearConversation();
                const customPath = `${driver.workspace}/notes/onboarding_playbook.md`;
                const custom =
                    '# Owner customization\nKeep launch work practical. Preserve this note.\n';
                await writeFile(customPath, custom);
                const offered = await driver.ask('custom-never-offered', suitable, {
                    conflict: true,
                });
                stateIs(offered, 'pending');
                expect(offered.messages.join('\n')).toMatch(/weekly|once a week|every week/iu);
                noSchedule(offered);
                for (const topic of [
                    'recipes/archetype/pa-coordinator',
                    'recipes/pattern/coordinator-synthesis',
                    'recipes/technique/reminder-cron',
                ]) {
                    expect(
                        offered.actions.some(
                            (action) =>
                                action.path === '/api/agent/manual/get' &&
                                action.query.topic === topic &&
                                action.status === 200
                        )
                    ).toBe(true);
                }
                expect(await readFile(customPath, 'utf8')).toBe(custom);
            },
            { reportSuffix: 'custom' }
        );
    },
    1_200_000
);

for (const [state, answer] of [
    [
        'declined',
        'No thanks. I do not want continuing coordination reviews. Please stop offering them.',
    ],
    [
        'postponed',
        'Later, please. Postpone the proposed coordination review until I explicitly ask to revisit it.',
    ],
]) {
    liveTest(
        `custom Cove preserves an actual ${state} answer across a cold session`,
        async () => {
            await withWeeklyCove(
                fixture,
                async (driver) => {
                    await driver.clearConversation();
                    await driver.seedState('pending');
                    const customPath = `${driver.workspace}/notes/onboarding_playbook.md`;
                    const custom =
                        '# Owner customization\nKeep launch work practical. Preserve this note.\n';
                    await writeFile(customPath, custom);
                    const answered = await driver.ask(`actual-${state}`, answer, {
                        conflict: true,
                    });
                    stateIs(answered, state);
                    expect(answered.messages.length).toBeGreaterThan(0);
                    noSchedule(answered);
                    await driver.cold();
                    const preserved = await driver.ask(`${state}-cold`, suitable, {
                        conflict: true,
                    });
                    stateIs(preserved, state);
                    expect(preserved.messages.length).toBeGreaterThan(0);
                    noSchedule(preserved);
                    expect(preserved.messages.join('\n')).not.toMatch(/weekly review/iu);
                    expect(await readFile(customPath, 'utf8')).toBe(custom);
                },
                { reportSuffix: state }
            );
        },
        600_000
    );
}

liveTest(
    'weekly proposal leaves an existing explicitly agreed daily review unchanged',
    async () => {
        await withWeeklyCove(
            fixture,
            async (driver) => {
                await driver.clearConversation();
                const agreed = await driver.ask(
                    'daily-consent',
                    'I explicitly want a quiet daily review of #product at 09:00 America/New_York. Post only new actionable findings in #product, at most three in one message. Schedule it now and confirm once.'
                );
                stateIs(agreed, 'enabled');
                expect(agreed.messages).toHaveLength(1);
                const before = await fixture.harness
                    .sql`select id, repeat, status, timezone, fire_at from reminders where server_id=${fixture.serverId}`;
                expect(before).toHaveLength(1);
                expect(before[0].repeat).toBe('daily@09:00');
                expect(before[0].timezone).toBe('America/New_York');
                expect(
                    new Intl.DateTimeFormat('en-US', {
                        timeZone: before[0].timezone,
                        hour: '2-digit',
                        minute: '2-digit',
                        hourCycle: 'h23',
                    }).format(new Date(before[0].fire_at))
                ).toBe('09:00');
                expect(
                    new Date(
                        nextReminderFireAt(
                            parseReminderRepeat(before[0].repeat),
                            Date.parse('2026-10-31T13:00:00Z'),
                            before[0].timezone
                        )
                    ).toISOString()
                ).toBe('2026-11-01T14:00:00.000Z');
                await driver.cold();
                const preserved = await driver.ask('daily-cold', suitable);
                stateIs(preserved, 'enabled');
                noSchedule(preserved);
                const after = await fixture.harness
                    .sql`select id, repeat, status, timezone, fire_at from reminders where server_id=${fixture.serverId}`;
                expect(after).toEqual(before);
            },
            { reportSuffix: 'daily' }
        );
    },
    600_000
);

liveTest(
    'custom no-offer guidance overrides the factory weekly default',
    async () => {
        await withWeeklyCove(
            fixture,
            async (driver) => {
                await driver.clearConversation();
                await writeFile(
                    `${driver.workspace}/notes/onboarding_playbook.md`,
                    '# Owner guidance\nNever offer coordination reviews. Use my current update pattern.\n'
                );
                const result = await driver.ask('custom-no-offer', suitable, { conflict: true });
                expect(result.messages.join('\n')).not.toMatch(/weekly review|weekly.*check.?in/iu);
                noSchedule(result);
            },
            { reportSuffix: 'custom-no-offer' }
        );
    },
    600_000
);

liveTest(
    'Cove schedules the agreed calendar timezone independently of its home timezone',
    async () => {
        await withWeeklyCove(
            fixture,
            async (driver) => {
                await driver.clearConversation();
                const result = await driver.ask(
                    'timezone-mismatch',
                    'Schedule a quiet weekly #product review every Friday at 09:00 America/New_York, reporting only new actionable findings in #product. I need that local time to hold across DST. Confirm once after the receipt; do not send a preliminary acknowledgment.'
                );
                expect(result.messages).toHaveLength(1);
                const rows = await fixture.harness
                    .sql`select id, repeat, timezone, fire_at from reminders where server_id=${fixture.serverId}`;
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
                const agents = await fixture.harness
                    .sql`select home_timezone from agents where id=${fixture.coveAgentId}`;
                expect(agents[0].home_timezone).toBe('UTC');
            },
            { reportSuffix: 'timezone-mismatch', homeTimezone: 'UTC' }
        );
    },
    600_000
);
