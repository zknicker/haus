import { afterAll, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import type { Tool } from '@modelcontextprotocol/client';
import { TestClock } from 'effect';
import type { HausDatabase } from '../postgres/connection.ts';
import { makeServerRuntime } from '../server-runtime.ts';
import { McpInventory } from './inventory.ts';
import { fakeQuery, fakeUpdate, tick } from './runtime-test-fixtures.ts';

const effectRuntime = makeServerRuntime();
afterAll(async () => {
    await effectRuntime.dispose();
});
const tool = { name: 'echo', inputSchema: { type: 'object' } } satisfies Tool;

test('a retired client cannot publish inventory after an awaited database read', async () => {
    const read = Promise.withResolvers<unknown[]>();
    const updates: unknown[] = [];
    const db = {
        select() {
            const query = fakeQuery([]);
            query.limit = () => read.promise;
            return query;
        },
        update: fakeUpdate(updates),
    } as unknown as HausDatabase;
    const inventory = new McpInventory(
        db,
        async () => [],
        () => undefined,
        effectRuntime
    );
    let current = true;
    const recording = inventory.record('connection', [tool], () => current);
    await tick();
    current = false;
    read.resolve([{ tools: ['old'] }]);
    await recording;
    expect(updates).toEqual([]);
    expect(inventory.read('connection')).toEqual([]);
    await inventory.close();
});

test('forgetting a connection rejects a late discovery; oversized catalogs never write', async () => {
    const discovery = Promise.withResolvers<readonly Tool[]>();
    const updates: unknown[] = [];
    const db = {
        select: () => fakeQuery([{ tools: [] }]),
        update: fakeUpdate(updates),
    } as unknown as HausDatabase;
    const inventory = new McpInventory(
        db,
        () => discovery.promise,
        () => undefined,
        effectRuntime
    );
    const refresh = inventory.refresh('connection');
    inventory.forget('connection');
    discovery.resolve([tool]);
    await refresh;
    expect(updates).toEqual([]);
    await expect(
        inventory.record(
            'connection',
            Array.from({ length: 1001 }, () => tool)
        )
    ).rejects.toThrow('1,000 tools');
    expect(updates).toEqual([]);
    await inventory.close();
});

test('reconciliation uses the Server clock and stops when its scope closes', async () => {
    const runtime = makeTestRuntime();
    let discoveries = 0;
    const db = {
        select: () => fakeQuery([{ id: 'connection', tools: [] }]),
        update: fakeUpdate([], [{ serverId: 'server' }]),
    } as unknown as HausDatabase;
    const inventory = new McpInventory(
        db,
        async () => {
            discoveries += 1;
            return [];
        },
        () => undefined,
        runtime
    );
    try {
        await inventory.start();
        expect(discoveries).toBe(1);
        await runtime.runPromise(TestClock.adjust('299 seconds'));
        expect(discoveries).toBe(1);
        await runtime.runPromise(TestClock.adjust('61 seconds'));
        expect(discoveries).toBe(2);
        await inventory.close();
        await runtime.runPromise(TestClock.adjust('1 hour'));
        expect(discoveries).toBe(2);
    } finally {
        await inventory.close();
        await runtime.dispose();
    }
});

test('retirement prevents a selected connection from reopening until reconnect seeds it', async () => {
    const runtime = makeTestRuntime();
    let discoveries = 0;
    const db = {
        select: () => fakeQuery([{ id: 'connection', tools: ['echo'] }]),
        update: fakeUpdate([]),
    } as unknown as HausDatabase;
    const inventory = new McpInventory(
        db,
        async () => {
            discoveries += 1;
            return [tool];
        },
        () => undefined,
        runtime
    );
    try {
        inventory.forget('connection');
        await inventory.start();
        expect(discoveries).toBe(0);
        await inventory.record('connection', [tool]);
        await runtime.runPromise(TestClock.adjust('360 seconds'));
        expect(discoveries).toBe(1);
        inventory.forget('connection');
        inventory.resume('connection');
        await runtime.runPromise(TestClock.adjust('360 seconds'));
        expect(discoveries).toBe(2);
    } finally {
        await inventory.close();
        await runtime.dispose();
    }
});
