import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';

let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_board_api_owner');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Board API Server',
        slug: 'board-api-server',
    });
    serverId = server.id;
    outsider = await signIn('user_board_api_outsider');
    await outsider.trpc.server.create.mutate({
        displayName: 'Board Outsider',
        slug: 'board-api-outsider',
    });
});

afterAll(async () => {
    owner?.close();
    outsider?.close();
    await harness?.close();
});

describe('boards', () => {
    test('a new Server starts with the General board and its default columns', async () => {
        const boards = await owner.trpc.board.list.query({ serverId });
        expect(boards).toEqual([
            expect.objectContaining({
                archivedAt: null,
                key: 'GEN',
                name: 'General',
                openTaskCount: 0,
                version: 1,
            }),
        ]);
        expect(boards[0]?.columns.map(({ category, name }) => ({ category, name }))).toEqual([
            { category: 'backlog', name: 'Backlog' },
            { category: 'todo', name: 'Todo' },
            { category: 'active', name: 'In progress' },
            { category: 'done', name: 'Done' },
            { category: 'canceled', name: 'Canceled' },
        ]);
        await expect(outsider.trpc.board.list.query({ serverId })).rejects.toThrow(/member/i);
    });

    test('creates, renames, re-keys, archives, and restores a board', async () => {
        const realtime = captureAllTopics();
        const { board } = await owner.trpc.board.create.mutate({
            key: 'SEC',
            name: 'Security',
            serverId,
        });
        await expect(
            owner.trpc.board.create.mutate({ key: 'SEC', name: 'Again', serverId })
        ).rejects.toThrow(/already uses the key SEC/);
        const task = await owner.trpc.task.create.mutate({
            boardId: board.id,
            serverId,
            title: 'Rotate the keys',
        });
        expect(task.task.key).toBe('SEC-1');

        const renamed = await owner.trpc.board.update.mutate({
            boardId: board.id,
            expectedVersion: 1,
            patch: { key: 'SAFE', name: 'Safety' },
            serverId,
        });
        expect(renamed.board).toMatchObject({ key: 'SAFE', name: 'Safety', version: 2 });
        await expect(
            owner.trpc.task.get.query({ serverId, taskId: task.task.id })
        ).resolves.toMatchObject({ key: 'SAFE-1' });
        await expect(
            owner.trpc.board.update.mutate({
                boardId: board.id,
                expectedVersion: 1,
                patch: { name: 'Stale' },
                serverId,
            })
        ).rejects.toThrow(/changed/);

        const archived = await owner.trpc.board.update.mutate({
            boardId: board.id,
            expectedVersion: 2,
            patch: { archived: true },
            serverId,
        });
        expect(archived.board.archivedAt).not.toBeNull();
        expect((await owner.trpc.board.list.query({ serverId })).map((row) => row.key)).toEqual([
            'GEN',
        ]);
        expect(
            (await owner.trpc.board.list.query({ includeArchived: true, serverId })).map(
                (row) => row.key
            )
        ).toEqual(['GEN', 'SAFE']);
        await expect(
            owner.trpc.task.create.mutate({ boardId: board.id, serverId, title: 'Refused' })
        ).rejects.toThrow(/archived board/);
        // An archived board's key stays taken.
        await expect(
            owner.trpc.board.create.mutate({ key: 'SAFE', name: 'Reuse', serverId })
        ).rejects.toThrow(/already uses the key/);
        const restored = await owner.trpc.board.update.mutate({
            boardId: board.id,
            expectedVersion: 3,
            patch: { archived: false },
            serverId,
        });
        expect(restored.board).toMatchObject({ archivedAt: null, openTaskCount: 1 });

        const published = await publishedSince(realtime, serverId);
        realtime.stop();
        expect(
            published
                .filter((event) => event.type === 'board.updated')
                .map((event) => event.version)
        ).toEqual([1, 2, 3, 4]);
    });

    test('the General board keeps its key and stays active', async () => {
        const [general] = await owner.trpc.board.list.query({ serverId });
        if (!general) {
            throw new Error('Expected the General board.');
        }
        await expect(
            owner.trpc.board.update.mutate({
                boardId: general.id,
                expectedVersion: general.version,
                patch: { archived: true },
                serverId,
            })
        ).rejects.toThrow(/General board/);
        await expect(
            owner.trpc.board.update.mutate({
                boardId: general.id,
                expectedVersion: general.version,
                patch: { key: 'MAIN' },
                serverId,
            })
        ).rejects.toThrow(/General board/);
    });
});

describe('board.setColumns', () => {
    test('replaces the column list and moves Tasks out of removed columns', async () => {
        const { board } = await owner.trpc.board.create.mutate({
            key: 'OPS',
            name: 'Ops',
            serverId,
        });
        const column = (name: string) => {
            const found = board.columns.find((entry) => entry.name === name);
            if (!found) {
                throw new Error(`No ${name} column.`);
            }
            return found;
        };
        const backlog = await owner.trpc.task.create.mutate({
            boardId: board.id,
            columnId: column('Backlog').id,
            serverId,
            title: 'Backlog item',
        });
        const canceled = await owner.trpc.task.create.mutate({
            boardId: board.id,
            columnId: column('Canceled').id,
            serverId,
            title: 'Dropped item',
        });
        expect(canceled.task.completedAt).not.toBeNull();
        const keep = ['Todo', 'In progress', 'Done'].map((name) => ({
            category: column(name).category,
            id: column(name).id,
            name: column(name).name,
        }));

        await expect(
            owner.trpc.board.setColumns.mutate({
                boardId: board.id,
                columns: keep,
                expectedVersion: 1,
                serverId,
            })
        ).rejects.toThrow(/still holds Tasks/);
        await expect(
            owner.trpc.board.setColumns.mutate({
                boardId: board.id,
                columns: keep.filter((entry) => entry.name !== 'Done'),
                expectedVersion: 1,
                serverId,
            })
        ).rejects.toThrow(/missing done/);

        const realtime = captureAllTopics();
        const result = await owner.trpc.board.setColumns.mutate({
            boardId: board.id,
            columns: [
                ...keep.slice(0, 2),
                { category: 'active', name: 'Review' },
                { ...keep[2], category: 'done', name: 'Shipped' },
            ],
            expectedVersion: 1,
            moveTasks: {
                [column('Backlog').id]: column('Todo').id,
                [column('Canceled').id]: column('In progress').id,
            },
            serverId,
        });
        expect(result.board.version).toBe(2);
        expect(result.board.columns.map(({ name, position }) => ({ name, position }))).toEqual([
            { name: 'Todo', position: 0 },
            { name: 'In progress', position: 1 },
            { name: 'Review', position: 2 },
            { name: 'Shipped', position: 3 },
        ]);
        const moved = await owner.trpc.task.list.query({ boardId: board.id, serverId });
        expect(
            moved.map(({ category, completedAt, id }) => ({ category, completedAt, id }))
        ).toEqual([
            { category: 'todo', completedAt: null, id: backlog.task.id },
            { category: 'active', completedAt: null, id: canceled.task.id },
        ]);
        const published = await publishedSince(realtime, serverId);
        realtime.stop();
        expect(
            published.filter((event) => event.type === 'task.updated').map((event) => event.taskId)
        ).toEqual([backlog.task.id, canceled.task.id]);
    });

    test('a kept column changing category closes or reopens its Tasks', async () => {
        const { board } = await owner.trpc.board.create.mutate({
            key: 'CAT',
            name: 'Categories',
            serverId,
        });
        const todo = board.columns.find((entry) => entry.category === 'todo');
        if (!todo) {
            throw new Error('No todo column.');
        }
        const { task } = await owner.trpc.task.create.mutate({
            boardId: board.id,
            serverId,
            title: 'Parked',
        });
        const columns = board.columns.map(({ category, id, name }) => ({ category, id, name }));
        const result = await owner.trpc.board.setColumns.mutate({
            boardId: board.id,
            columns: [
                ...columns.map((entry) =>
                    entry.id === todo.id ? { ...entry, category: 'canceled' as const } : entry
                ),
                { category: 'todo', name: 'Up next' },
            ],
            expectedVersion: 1,
            serverId,
        });
        expect(result.board.openTaskCount).toBe(0);
        const closed = await owner.trpc.task.get.query({ serverId, taskId: task.id });
        expect(closed).toMatchObject({ category: 'canceled', version: 2 });
        expect(closed.completedAt).not.toBeNull();
    });
});

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    return createHausClient(harness, token);
}
