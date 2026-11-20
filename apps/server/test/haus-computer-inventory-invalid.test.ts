import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    recordComputerInventory,
    recordInvalidComputerInventory,
} from '../src/computers/record-inventory.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const computerId = `cmp_${'i'.repeat(16)}`;
const inventory = {
    runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }],
};

let harness: HausServerHarness;
let connection: HausConnection;
let owner: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('inventory-owner'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Inventory',
        slug: 'inventory',
    });
    serverId = server.id;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory)
        values (${computerId}, ${serverId}, ${server.viewerUserId}, ${'e'.repeat(64)}, ${inventory}::jsonb)
    `;
});

afterAll(async () => {
    owner?.close();
    await connection?.close();
    await harness?.close();
});

test('an invalid inventory report marks the Computer until a valid one arrives', async () => {
    const read = async () =>
        (await owner.trpc.computer.list.query({ serverId })).find(
            (computer) => computer.id === computerId
        )?.inventoryInvalidAt;
    expect(await read()).toBeNull();

    expect(await recordInvalidComputerInventory(connection.db, computerId)).toBe(true);
    expect(await recordInvalidComputerInventory(connection.db, computerId)).toBe(false);
    expect(await read()).not.toBeNull();

    expect(await recordComputerInventory(connection.db, computerId, inventory)).toBe(true);
    expect(await read()).toBeNull();
    expect(await recordComputerInventory(connection.db, computerId, inventory)).toBe(false);
});
