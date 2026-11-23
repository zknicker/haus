import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('co-author trailers name each person by their Haus account, and say who has none', async () => {
    await fixture.harness.sql`
        update users set display_name = 'Ada Lovelace', email = 'ada@example.test'
        where id = ${fixture.ownerUserId}
    `;
    const runner = await fixture.mintRunner('run_co_authors');

    const answered = await fixture.post('/api/agent/repos/co-authors', runner, {
        people: ['ADA', 'ghost'],
    });
    await fixture.harness.sql`update users set email = null where id = ${fixture.ownerUserId}`;
    const unreachable = await fixture.post('/api/agent/repos/co-authors', runner, {
        people: ['ada'],
    });

    expect(answered.status).toBe(200);
    expect(answered.body).toEqual({
        coAuthors: [{ handle: 'ada', trailer: 'Co-authored-by: Ada Lovelace <ada@example.test>' }],
        missing: [{ handle: 'ghost', reason: 'unknown' }],
    });
    expect(unreachable.body).toEqual({
        coAuthors: [],
        missing: [{ handle: 'ada', reason: 'no-email' }],
    });
});
