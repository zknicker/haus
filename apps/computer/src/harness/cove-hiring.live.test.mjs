import { expect, test } from 'bun:test';

const live = process.env.HAUS_RUN_COVE_WEEKLY_TEST === '1';
const withWeeklyCove = live
    ? (await import('./cove-weekly-live-fixture.mjs')).withWeeklyCove
    : null;
const fixture = live
    ? (await import('../../../server/test/agent-creation-fixture.ts')).agentCreationFixture()
    : null;
const legacyRepo = process.env.HAUS_COVE_LEGACY_REPO;

for (const legacy of [false, true]) {
    const enabled = live && (!legacy || legacyRepo);
    (enabled ? test : test.skip)(
        `${legacy ? 'old d031' : 'current'} Cove retrieves full recipes and creates a standing-brief lane on the new Server`,
        async () => {
            await withWeeklyCove(
                fixture,
                async (driver) => {
                    await driver.clearConversation();
                    await fixture.harness
                        .sql`update agents set retired_at=now() where server_id=${fixture.serverId} and created_by_agent_id=${fixture.coveAgentId}`;
                    if (legacy) {
                        const { legacyCreationRefusals } = await import(
                            './cove-legacy-cli-probe.mjs'
                        );
                        const refusals = await legacyCreationRefusals(fixture, legacyRepo);
                        driver.evidence.legacyCliRefusals = refusals;
                        expect(refusals[0].stderr).toContain('Code: INVALID_ARG');
                        expect(refusals[0].stderr).toContain('Next action:');
                        expect(refusals[1].stderr).toContain(
                            'Code: AGENT_CREATION_GUIDANCE_REQUIRED'
                        );
                        expect(refusals[1].stderr).toContain('recipes/decision/one-or-many');
                    }
                    const result = await driver.ask(
                        `hiring-${legacy}`,
                        'Create one teammate named Watchkeeper for a read-only #product delivery-evidence watch. I approve this hire and joining #product. Use a patrol-style standing brief: verify recent task/message evidence, post the first baseline once, then only changed actionable findings or coverage gaps. Keep implementation with its lane owner. No recurring schedule is approved yet. Introduce the confirmed handle once in #all. This is urgent setup; do not offer weekly reviews now.'
                    );
                    const created = result.actions.filter(
                        (action) => action.path === '/api/agent/agents' && action.status === 200
                    );
                    expect(created).toHaveLength(1);
                    expect(created[0].result.idempotent).toBe(false);
                    expect(created[0].result.agent.retired).toBe(false);
                    expect(created[0].body.brief?.trim().length).toBeGreaterThan(0);
                    expect(created[0].result.channels).toContain('#product');
                    for (const topic of [
                        'agent',
                        'recipes/decision/one-or-many',
                        'recipes/archetype/patrol',
                    ]) {
                        expect(
                            result.actions.some(
                                (action) =>
                                    action.path === '/api/agent/manual/get' &&
                                    action.query.topic === topic &&
                                    action.status === 200
                            )
                        ).toBe(true);
                    }
                    const announcements = result.actions.filter(
                        (action) =>
                            action.path === '/api/agent/messages/send' &&
                            action.body.target === '#all' &&
                            action.result?.state === 'sent'
                    );
                    expect(announcements).toHaveLength(1);
                    expect(announcements[0].body.content).toContain(created[0].result.agent.handle);
                    expect(
                        result.actions.filter(
                            (action) => action.path === '/api/agent/reminders/schedule'
                        )
                    ).toHaveLength(0);
                },
                {
                    reportSuffix: legacy ? 'legacy-hire' : 'current-hire',
                    legacyRepo: legacy ? legacyRepo : null,
                }
            );
        },
        600_000
    );
}
