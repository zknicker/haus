import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { RepoFolderAnswer } from '@haus/api';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { ingestRepoClones } from '../src/repos/repo-folder-write.ts';
import {
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { addMember } from './model-connection.fixture.ts';

let setup: InvocationHarness;
let computer: FrameClient;
let member: HausClient;
let connection: HausConnection;
const answered = new Set<unknown>();

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'repo-folders' });
    await setup.harness.sql`
        update computers set reported_inventory = reported_inventory || '{"name":"Studio"}'::jsonb
        where id = ${setup.computerId}
    `;
    member = await addMember(setup.harness, setup, 'user_repo_folders_member');
    computer = await connectComputer(setup.harness, setup.computerCredential);
    connection = await connectHausDatabase(setup.harness.databaseUrl);
});

afterAll(async () => {
    computer?.close();
    member?.close();
    await connection?.close();
    await setup?.close();
});

test('only the attacher adds a folder, and the online Computer names its real path and repo', async () => {
    const scope = { computerId: setup.computerId, serverId: setup.serverId };
    await expect(
        member.trpc.computer.addRepoFolder.mutate({ ...scope, path: '/Users/ada/src/haus' })
    ).rejects.toThrow('Only the person who attached Studio can add a folder there');

    const adding = setup.owner.trpc.computer.addRepoFolder.mutate({
        ...scope,
        path: '/Users/ada/src/haus/',
    });
    const inspect = await answerNext({
        kind: 'inspect',
        path: '/Users/ada/src/haus',
        repository: 'Haus/Haus',
    });
    expect(inspect.operation).toEqual({ kind: 'inspect', path: '/Users/ada/src/haus/' });
    expect(await adding).toEqual({
        added: true,
        path: '/Users/ada/src/haus',
        repository: 'haus/haus',
    });

    const refused = setup.owner.trpc.computer.addRepoFolder.mutate({
        ...scope,
        path: '/Users/ada/src/other',
    });
    await answerNext({ error: 'Its origin is not on github.com.', kind: 'failed' });
    await expect(refused).rejects.toThrow('Its origin is not on github.com.');

    const listed = await setup.owner.trpc.computer.repoFolders.query(scope);
    expect(listed).toMatchObject({
        canAdd: true,
        canRemove: true,
        folders: [
            {
                addedBy: { name: 'Ada' },
                computerId: setup.computerId,
                path: '/Users/ada/src/haus',
                repository: 'haus/haus',
            },
        ],
    });
    expect(await member.trpc.computer.repoFolders.query(scope)).toMatchObject({
        canAdd: false,
        canRemove: false,
    });

    const states = setup.owner.trpc.computer.repoFolderStates.query(scope);
    const check = await answerNext({
        kind: 'check',
        states: [{ path: '/Users/ada/src/haus', state: 'missing' }],
    });
    expect(check.operation).toEqual({
        folders: [{ path: '/Users/ada/src/haus', repository: 'haus/haus' }],
        kind: 'check',
    });
    expect(await states).toEqual({ states: [{ path: '/Users/ada/src/haus', state: 'missing' }] });
});

test('removing a folder refuses while a Haus worktree of it exists, and naming them', async () => {
    const scope = { computerId: setup.computerId, serverId: setup.serverId };
    await addFolder('/Users/ada/src/site', 'haus/site');
    await expect(
        member.trpc.computer.removeRepoFolder.mutate({ ...scope, repository: 'haus/site' })
    ).rejects.toThrow('Only the person who attached Studio, an Owner, or an Admin');

    const kept = '/Users/ada/.haus/computer/servers/srv/worktrees/wkr_1/haus/site';
    const refused = setup.owner.trpc.computer.removeRepoFolder.mutate({
        ...scope,
        repository: 'Haus/Site',
    });
    const asked = await answerNext({ kind: 'worktrees', worktrees: [kept] });
    expect(asked.operation).toEqual({ kind: 'worktrees', path: '/Users/ada/src/site' });
    await expect(refused).rejects.toThrow(
        `Haus still has worktrees of /Users/ada/src/site on Studio: ${kept}.`
    );

    const removing = setup.owner.trpc.computer.removeRepoFolder.mutate({
        ...scope,
        repository: 'haus/site',
    });
    await answerNext({ kind: 'worktrees', worktrees: [] });
    expect(await removing).toEqual({ removed: true, repository: 'haus/site' });
    expect(await repos()).toContain('haus/site');
});

test("a Computer's clones become its folders only where it has none, and a person's folder waits for the clone to go", async () => {
    const scope = { computerId: setup.computerId, serverId: setup.serverId };
    const clone = '/Users/ada/.haus/computer/servers/srv/repos/haus/docs';
    expect(
        await ingestRepoClones(connection.db, scope, [
            { path: clone, repository: 'haus/docs' },
            {
                path: '/Users/ada/.haus/computer/servers/srv/repos/haus/haus',
                repository: 'haus/haus',
            },
        ])
    ).toBe(true);
    expect(
        await ingestRepoClones(connection.db, scope, [{ path: clone, repository: 'haus/docs' }])
    ).toBe(false);
    expect(await folders()).toEqual([
        { added_by_user_id: null, path: clone, repository: 'haus/docs' },
        {
            added_by_user_id: setup.harness.humans.userIdForSubject('user_repo-folders'),
            path: '/Users/ada/src/haus',
            repository: 'haus/haus',
        },
    ]);

    const adding = setup.owner.trpc.computer.addRepoFolder.mutate({
        ...scope,
        path: '/Users/ada/src/docs',
    });
    await answerNext({ kind: 'inspect', path: '/Users/ada/src/docs', repository: 'haus/docs' });
    await expect(adding).rejects.toThrow(
        `Studio already works on haus/docs in Haus's own clone at ${clone}. Remove the Haus clone first`
    );
});

test('haus-computer repo acts as the signed-in person: the attacher adds and lists, a member cannot add', async () => {
    const owner = await loginSession('user_repo-folders');
    const other = await loginSession('user_repo_folders_member');
    const body = {
        computerId: setup.computerId,
        path: '/Users/ada/src/cli',
        repository: 'Haus/CLI',
    };

    expect(await post('/computer/repos/add', { ...body, accessToken: owner })).toEqual({
        body: { added: true, path: '/Users/ada/src/cli', repository: 'haus/cli' },
        status: 200,
    });
    expect(await post('/computer/repos/add', { ...body, accessToken: other })).toMatchObject({
        body: { code: 'denied' },
        status: 403,
    });
    const listed = await post('/computer/repos/list', {
        accessToken: owner,
        computerId: setup.computerId,
    });
    expect(listed.body.computerName).toBe('Studio');
    expect(
        listed.body.folders.map((folder: { repository: string }) => folder.repository)
    ).toContain('haus/cli');
    expect(
        await post('/computer/repos/add', { ...body, accessToken: 'not-a-token' })
    ).toMatchObject({ body: { code: 'computer_login_malformed' }, status: 400 });
});

async function answerNext(answer: RepoFolderAnswer) {
    const request = await computer.next(
        (frame) => frame.type === 'repo-folder-request' && !answered.has(frame.requestId)
    );
    answered.add(request.requestId);
    computer.send({ answer, requestId: request.requestId, type: 'repo-folder-result' });
    return request;
}

async function addFolder(path: string, repository: string) {
    const adding = setup.owner.trpc.computer.addRepoFolder.mutate({
        computerId: setup.computerId,
        path,
        serverId: setup.serverId,
    });
    await answerNext({ kind: 'inspect', path, repository });
    return await adding;
}

async function repos() {
    const rows = await setup.harness.sql`
        select repository from repos where server_id = ${setup.serverId} order by repository`;
    return rows.map((row: { repository: string }) => row.repository);
}

async function folders() {
    return await setup.harness.sql`
        select repository, path, added_by_user_id from repo_folders
        where computer_id = ${setup.computerId} order by repository`;
}

async function loginSession(subject: string) {
    const client = createHausClient(
        setup.harness,
        await setup.harness.humans.mintSessionToken(subject)
    );
    try {
        const started = await post('/computer/login', { origin: setup.harness.url.origin });
        await client.trpc.computer.login.approve.mutate({ userCode: started.body.userCode });
        const exchanged = await post('/computer/login/poll', {
            deviceCode: started.body.deviceCode,
        });
        return exchanged.body.accessToken as string;
    } finally {
        client.close();
    }
}

async function post(path: string, body: object) {
    const response = await fetch(new URL(path, setup.harness.url), {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    return { body: await response.json(), status: response.status };
}
