import { expect, test } from 'bun:test';
import { createAppSessionFixture } from './app-session-fixture.ts';

test('App session fixtures refuse a remote database before connecting', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
        await expect(
            createAppSessionFixture({
                databaseUrl: 'postgres://haus@db.haus.chat:5432/haus_test',
                subject: 'cf-fixture-user',
                userId: 'usr_aaaaaaaaaaaaaaaa',
                verifiedEmails: [],
            })
        ).rejects.toThrow(/loopback PostgreSQL/u);
    } finally {
        if (previous === undefined) {
            process.env.NODE_ENV = undefined;
        } else {
            process.env.NODE_ENV = previous;
        }
    }
});
