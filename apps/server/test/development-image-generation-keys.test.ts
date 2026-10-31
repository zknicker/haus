import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    readDevelopmentImageGenerationKeys,
    seedDevelopmentImageGenerationKeys,
} from '../src/development/seed-image-generation-keys.ts';
import { seedDevelopmentServer } from '../src/development/seed-server.ts';
import { readImageGenerationKey } from '../src/image-generation/image-generation-keys.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const subject = 'user_dev_image_keys_owner';

let harness: HausServerHarness;
let database: HausConnection;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    database = await connectHausDatabase(harness.databaseUrl);
    harness.humans.setVerifiedEmails(subject, ['dev@haus.test']);
    await harness.humans.mintSessionToken(subject);
    const userId = harness.humans.userIdForSubject(subject);
    serverId = (await seedDevelopmentServer(database.db, userId)).id;
});

afterAll(async () => {
    await database?.close();
    await harness?.close();
});

test('skips providers whose dev key is absent', async () => {
    const seeded = await seedDevelopmentImageGenerationKeys(database.db, {
        keys: readDevelopmentImageGenerationKeys({}),
        serverId,
    });

    expect(seeded).toEqual([]);
    expect(await readImageGenerationKey(database.db, serverId, 'openai')).toBeNull();
    expect(await readImageGenerationKey(database.db, serverId, 'gemini')).toBeNull();
});

test('stores present keys once and never overwrites an existing key', async () => {
    const first = await seedDevelopmentImageGenerationKeys(database.db, {
        keys: { openai: 'sk-fixture-openai' },
        serverId,
    });
    expect(first).toEqual(['openai']);
    expect(await readImageGenerationKey(database.db, serverId, 'openai')).toBe('sk-fixture-openai');

    const second = await seedDevelopmentImageGenerationKeys(database.db, {
        keys: { gemini: 'fixture-gemini', openai: 'sk-fixture-rotated' },
        serverId,
    });
    expect(second).toEqual(['gemini']);
    expect(await readImageGenerationKey(database.db, serverId, 'openai')).toBe('sk-fixture-openai');
    expect(await readImageGenerationKey(database.db, serverId, 'gemini')).toBe('fixture-gemini');
});
