import { afterAll, beforeAll, expect, test } from 'bun:test';
import { artifactPathKey } from '@haus/api';
import { eq } from 'drizzle-orm';
import { rebindPushCitations } from '../src/drive/citations.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { artifactRevisionsTable, artifactsTable } from '../src/postgres/schema.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createTestProject } from './project.fixture.ts';

const fixture = agentCreationFixture();
let connection: HausConnection;
let notesChatId: string;

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
    const notes = await createTestProject(fixture.owner, {
        agentIds: [fixture.orbitAgentId],
        name: 'drive-notes',
        serverId: fixture.serverId,
    });
    notesChatId = notes.id;
});

afterAll(async () => {
    await connection?.close();
});

async function insertRevision(artifactId: string, revisionNumber: number) {
    const revisionId = createOpaqueId('rev');
    const filename = 'file.md';
    await connection.db.insert(artifactRevisionsTable).values({
        artifactId,
        authorKey: `user:${fixture.ownerUserId}`,
        authorUserId: fixture.ownerUserId,
        contentType: 'text/markdown',
        filename,
        id: revisionId,
        objectKey: `servers/${fixture.serverId}/artifacts/${artifactId}/${revisionId}`,
        requestId: createOpaqueId('req'),
        reservedBytes: 0,
        revisionNumber,
        serverId: fixture.serverId,
        sha256: 'a'.repeat(64),
        state: 'ready',
        title: filename,
    });
    await connection.db
        .update(artifactsTable)
        .set({ currentRevisionId: revisionId, nextRevision: revisionNumber + 1 })
        .where(eq(artifactsTable.id, artifactId));
    return revisionId;
}

async function insertFile(path: string) {
    const artifactId = createOpaqueId('art');
    await connection.db.insert(artifactsTable).values({
        creatorUserId: fixture.ownerUserId,
        id: artifactId,
        path,
        pathKey: artifactPathKey(path),
        serverId: fixture.serverId,
    });
    return { artifactId, revisionId: await insertRevision(artifactId, 1) };
}

async function agentSend(runId: string, content: string) {
    const runner = await fixture.mintRunner(runId);
    const response = await fetch(new URL('/api/agent/messages/send', fixture.harness.url), {
        body: JSON.stringify({ content, nonce: `nonce_${runId}`, target: '#drive-notes' }),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    const sent = (await response.json()) as { message: { id: string } };
    expect(sent).toMatchObject({ state: 'sent' });
    return sent.message.id;
}

async function citationsOf(chatId: string, messageId: string) {
    const { owner, serverId } = fixture;
    const page = await owner.trpc.chat.messages.query({ chatId, limit: 50, serverId });
    return page.messages.find((message) => message.id === messageId)?.driveCitations;
}

test('an Agent send binds each cited path once, to the head or to nulls', async () => {
    const launch = await insertFile('haus/plans/launch.md');
    const messageId = await agentSend(
        'run_citations_agent',
        [
            'See [plan](drive://haus/plans/launch.md) and [again](drive://HAUS/Plans/Launch.md).',
            'Draft: [idea](drive://haus/notes/new%20idea.md).',
            'Ignored: [up](drive://haus/../x.md), [broken](drive://haus/%E0%A4%A.md),',
            '[web](https://example.com/a.md), `[code](drive://haus/code.md)`.',
        ].join(' ')
    );

    expect(await citationsOf(notesChatId, messageId)).toEqual([
        {
            artifactId: launch.artifactId,
            path: 'haus/plans/launch.md',
            revisionId: launch.revisionId,
        },
        { artifactId: null, path: 'haus/notes/new idea.md', revisionId: null },
    ]);
});

test('a send reads links the way the App renders them', async () => {
    const plan = await insertFile('haus/plans/Q4 plan.md');
    const draft = await insertFile('haus/plans/Q4 (draft).md');
    const messageId = await agentSend(
        'run_citations_syntax',
        [
            'See [plan](<drive://haus/plans/Q4 plan.md>) and [draft](drive://haus/plans/Q4%20(draft).md).',
            'Not cited: ``[code](drive://haus/code.md)``, ![image](drive://haus/image.png),',
            '\n```md\n[fenced](drive://haus/fenced.md)\n```\n',
        ].join(' ')
    );

    expect(await citationsOf(notesChatId, messageId)).toEqual([
        { artifactId: plan.artifactId, path: 'haus/plans/Q4 plan.md', revisionId: plan.revisionId },
        {
            artifactId: draft.artifactId,
            path: 'haus/plans/Q4 (draft).md',
            revisionId: draft.revisionId,
        },
    ]);
});

test('a send reads titles, escapes, angle spaces and every kind of code as Markdown does', async () => {
    const titled = await insertFile('haus/titled.md');
    const escaped = await insertFile('haus/a(draft.md');
    await insertFile('haus/space.md');
    const cell = await insertFile('haus/cell.md');
    const struck = await insertFile('haus/struck.md');
    const messageId = await agentSend(
        'run_citations_commonmark',
        [
            '[t](drive://haus/titled.md "Title") [e](drive://haus/a\\(draft.md)',
            '[s](<drive://haus/space.md >)',
            '`a',
            '[m](drive://haus/multiline.md) b`',
            '`a`` [x](drive://haus/mismatch.md) `',
            '',
            '> ```',
            '> [q](drive://haus/quoted.md)',
            '> ```',
            '',
            '| File |',
            '| --- |',
            '| [c](drive://haus/cell.md) |',
            '',
            '~~[k](drive://haus/struck.md)~~',
        ].join('\n')
    );

    expect(await citationsOf(notesChatId, messageId)).toEqual([
        { artifactId: titled.artifactId, path: 'haus/titled.md', revisionId: titled.revisionId },
        { artifactId: escaped.artifactId, path: 'haus/a(draft.md', revisionId: escaped.revisionId },
        { artifactId: null, path: 'haus/space.md ', revisionId: null },
        { artifactId: cell.artifactId, path: 'haus/cell.md', revisionId: cell.revisionId },
        { artifactId: struck.artifactId, path: 'haus/struck.md', revisionId: struck.revisionId },
    ]);
});

test('a pipe in a table cell splits the cell, so its broken link cites nothing', async () => {
    await insertFile('haus/pipe|x.md');
    const note = await insertFile('haus/note.md');
    const messageId = await agentSend(
        'run_citations_gfm_pipe',
        [
            '| File | Rest | Note |',
            '| --- | --- | --- |',
            '| [p](drive://haus/pipe|x.md) | [n](drive://haus/note.md) |',
        ].join('\n')
    );

    expect(await citationsOf(notesChatId, messageId)).toEqual([
        { artifactId: note.artifactId, path: 'haus/note.md', revisionId: note.revisionId },
    ]);
});

test('a human send binds to the head, and a later revision does not move it', async () => {
    const { channelId, owner, serverId } = fixture;
    const brief = await insertFile('haus/brief.md');
    const sent = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Read [the brief](drive://haus/brief.md).',
        nonce: 'drive-citations-human',
        serverId,
    });
    const cited = {
        artifactId: brief.artifactId,
        path: 'haus/brief.md',
        revisionId: brief.revisionId,
    };
    expect(sent.message.driveCitations).toEqual([cited]);

    const newer = await insertRevision(brief.artifactId, 2);
    expect(await citationsOf(channelId, sent.message.id)).toEqual([cited]);

    const later = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Updated [the brief](drive://haus/brief.md).',
        nonce: 'drive-citations-human-later',
        serverId,
    });
    expect(later.message.driveCitations).toEqual([{ ...cited, revisionId: newer }]);
});

test("a push close moves only its own run's citations of the paths it changed", async () => {
    const { channelId, orbitAgentId, owner, serverId } = fixture;
    const report = await insertFile('haus/report.md');
    const stable = await insertFile('haus/stable.md');
    const content =
        'Wrote [report](drive://haus/report.md), [stable](drive://haus/stable.md), [todo](drive://haus/todo.md).';
    const pushed = await agentSend('run_citations_push', content);
    const other = await agentSend('run_citations_other', content);
    const human = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content,
        nonce: 'drive-citations-push-human',
        serverId,
    });

    const pushedReport = await insertRevision(report.artifactId, 2);
    const todo = await insertFile('haus/todo.md');
    const moved = await connection.db.transaction(
        async (tx) =>
            await rebindPushCitations(tx, {
                agentId: orbitAgentId,
                bindings: new Map([
                    ['haus/Report.md', { artifactId: report.artifactId, revisionId: pushedReport }],
                    ['haus/todo.md', todo],
                ]),
                pushId: 'run_citations_push',
                serverId,
            })
    );
    expect(moved).toEqual([pushed]);

    const before = [
        { artifactId: report.artifactId, path: 'haus/report.md', revisionId: report.revisionId },
        { artifactId: stable.artifactId, path: 'haus/stable.md', revisionId: stable.revisionId },
        { artifactId: null, path: 'haus/todo.md', revisionId: null },
    ];
    expect(await citationsOf(notesChatId, pushed)).toEqual([
        { artifactId: report.artifactId, path: 'haus/report.md', revisionId: pushedReport },
        before[1],
        { ...todo, path: 'haus/todo.md' },
    ]);
    expect(await citationsOf(notesChatId, other)).toEqual(before);
    expect(await citationsOf(channelId, human.message.id)).toEqual(before);

    const again = await connection.db.transaction(
        async (tx) =>
            await rebindPushCitations(tx, {
                agentId: orbitAgentId,
                bindings: new Map([
                    ['haus/report.md', { artifactId: report.artifactId, revisionId: pushedReport }],
                ]),
                pushId: 'run_citations_push',
                serverId,
            })
    );
    expect(again).toEqual([]);
});
