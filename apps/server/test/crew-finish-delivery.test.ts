import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentCommand, CrewFinish } from '@haus/api';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { settleCrewTurn } from '../src/tasks/crew-finish.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { RecordingRunner } from './recording-runner.ts';

const fixture = agentCreationFixture();
let connection: HausConnection;
let orbit: { token: string };

interface Crew {
    agentId: string;
    chatId: string;
    id: string;
    shortId: string;
}

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
    orbit = await fixture.mintRunner('run_crew_finish_orbit');
});

afterAll(async () => {
    await connection?.close();
});

test('a crew turn that settles sends its Captain one content-free finish', async () => {
    const crew = await startCrew('Audit the member directory copy.');
    const runId = await takeQueuedTurn(crew);
    await post(crew, runId, 'Audited it; two labels need a rename.');
    await connection.db.transaction(async (tx) => {
        await settleCrewTurn(tx, { ...ids(crew), runId, status: 'completed' });
        await settleCrewTurn(tx, { ...ids(crew), runId, status: 'completed' });
    });
    expect(await finishesOf(crew)).toEqual([
        {
            ending: 'finished',
            id: `crew-finish:${crew.id}:${runId}`,
            taskShortId: crew.shortId,
            title: expect.any(String),
        },
    ]);
});

test('a turn a person drove reaches the Captain too, and an interrupted turn does not', async () => {
    const crew = await startCrew('Profile the nightly export.');
    await takeQueuedTurn(crew);
    await fixture.owner.trpc.chat.send.mutate({
        chatId: crew.chatId,
        content: 'Can you also check the index?',
        nonce: createOpaqueId('non'),
        serverId: fixture.serverId,
    });
    const personRun = await takeQueuedTurn(crew);
    await connection.db.transaction(async (tx) => {
        await settleCrewTurn(tx, { ...ids(crew), runId: personRun, status: 'completed' });
        await settleCrewTurn(tx, { ...ids(crew), runId: 'run_person_stop', status: 'interrupted' });
        await settleCrewTurn(tx, { ...ids(crew), runId: 'run_person_failed', status: 'failed' });
    });
    expect((await finishesOf(crew)).map((item) => [item.id, item.ending])).toEqual([
        [`crew-finish:${crew.id}:${personRun}`, 'finished'],
        [`crew-finish:${crew.id}:run_person_failed`, 'failed'],
    ]);
});

test('a Task that @mentions a person waits on them until a person posts', async () => {
    const crew = await startCrew('Ship the avatar upload flow.');
    const runId = await takeQueuedTurn(crew);
    await post(crew, runId, '@ada The upload works. Ship it behind the flag?');
    expect(await readTask(crew)).toMatchObject({ activity: 'waiting', needsYou: true });
    await connection.db.transaction((tx) =>
        settleCrewTurn(tx, { ...ids(crew), runId, status: 'completed' })
    );
    expect((await finishesOf(crew)).map((item) => item.ending)).toEqual(['waiting']);
    await fixture.owner.trpc.chat.send.mutate({
        chatId: crew.chatId,
        content: 'Yes, behind the flag.',
        nonce: createOpaqueId('non'),
        serverId: fixture.serverId,
    });
    expect((await readTask(crew)).needsYou).toBe(false);
});

test('a later Task message with no mention ends the wait', async () => {
    const crew = await startCrew('Draft the release notes.');
    const runId = await takeQueuedTurn(crew);
    await post(crew, runId, '@ada Which version number?');
    expect((await readTask(crew)).needsYou).toBe(true);
    await post(crew, runId, 'Found it in the changelog; drafting now.');
    expect((await readTask(crew)).needsYou).toBe(false);
});

test('finishes from several Tasks of one Captain ride one run', async () => {
    const first = await startCrew('Patch the login bug.');
    const second = await startCrew('Patch the logout bug.');
    for (const crew of [first, second]) {
        const runId = await takeQueuedTurn(crew);
        await connection.db.transaction((tx) =>
            settleCrewTurn(tx, { ...ids(crew), runId, status: 'completed' })
        );
    }
    await fixture.harness.sql`
        update agent_inbox set state = 'seen', seen_at = now()
        where agent_id = ${fixture.orbitAgentId} and source <> 'crew_finish' and state = 'queued'
    `;
    const runner = new RecordingRunner();
    runner.attach(fixture.orbitAgentId);
    const transport = { isOnline: () => true, send: () => true };
    const delivery = new AgentDelivery(connection.db, transport, undefined, runner);
    await delivery.dispatchAgent(fixture.orbitAgentId, fixture.serverId);
    const start = runner.starts()[0] as Extract<AgentCommand, { type: 'start' }> | undefined;
    const shortIds = (start?.crewFinishes ?? []).map((item) => item.taskShortId);
    expect(shortIds).toEqual(expect.arrayContaining([first.shortId, second.shortId]));
    expect(start).toMatchObject({ chatId: null, inboxDelivery: 'concrete' });
});

test('an Issue assigned to a Task wakes the Task agent, and its own edits wake no one', async () => {
    const filed = await call(orbit, '/api/agent/issues/create', { title: 'Rotate the API key' });
    const { code } = filed.body.issue as { code: string };
    const [stored] = (await fixture.harness.sql`
        select id from issues where title = 'Rotate the API key'
    `) as { id: string }[];
    const issue = { code, id: stored?.id ?? '' };
    const crew = await startCrew('Rotate the API key.', issue.code);
    const runId = await takeQueuedTurn(crew);
    await fixture.owner.trpc.issue.comment.mutate({
        body: 'Use the new vault path.',
        issueId: issue.id,
        serverId: fixture.serverId,
    });
    expect(await issueItems(crew.agentId)).toEqual(['issue_event']);
    const asTask = await fixture.mintRunner(runId, crew.agentId, crew.chatId, false);
    const moved = await call(asTask, '/api/agent/issues/update', {
        code: issue.code,
        state: 'in_progress',
    });
    expect(moved.status).toBe(200);
    expect(await issueItems(fixture.orbitAgentId)).toEqual([]);
});

async function issueItems(agentId: string) {
    const rows = (await fixture.harness.sql`
        select source from agent_inbox
        where agent_id = ${agentId} and source in ('issue_assignment', 'issue_event')
            and state = 'queued'
    `) as { source: string }[];
    return rows.map((row) => row.source);
}

async function call(runner: { token: string }, path: string, body: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}

async function startCrew(brief: string, issue?: string) {
    const reply = await call(orbit, '/api/agent/tasks/start', {
        brief,
        issue,
        machine: fixture.computerId,
    });
    const { shortId } = reply.body.task as { shortId: string };
    const task = await fixture.owner.trpc.task.get.query({ serverId: fixture.serverId, shortId });
    const crew: Crew = {
        agentId: task.agentId ?? '',
        chatId: task.chatId ?? '',
        id: task.id,
        shortId: task.shortId,
    };
    return crew;
}

async function takeQueuedTurn(crew: Crew) {
    const runId = createOpaqueId('run');
    await fixture.harness.sql`
        insert into agent_run_triggers (server_id, agent_id, run_id, chat_id, source, work_id)
        select server_id, agent_id, ${runId}, chat_id, source, dedupe_key from agent_inbox
        where agent_id = ${crew.agentId} and state = 'queued'
        order by created_at limit 1
    `;
    await fixture.harness.sql`
        update agent_inbox set run_id = ${runId}, state = 'accepted', accepted_at = now()
        where agent_id = ${crew.agentId} and state = 'queued'
    `;
    return runId;
}

async function post(crew: Crew, runId: string, content: string) {
    const runner = await fixture.mintRunner(runId, crew.agentId, crew.chatId, false);
    const path = '/api/agent/messages/send';
    const target = `task:${crew.shortId}`;
    const first = await call(runner, path, { content, nonce: createOpaqueId('non'), target });
    const sent =
        'shownMessages' in first.body
            ? await call(runner, path, {
                  nonce: createOpaqueId('non'),
                  sendDraft: true,
                  target,
              })
            : first;
    expect(sent.body).toMatchObject({ message: { id: expect.any(String) } });
}

async function finishesOf(crew: Crew) {
    const rows = (await fixture.harness.sql`
        select content from agent_inbox
        where agent_id = ${fixture.orbitAgentId} and source = 'crew_finish'
        order by created_at
    `) as { content: string }[];
    return rows
        .map((row) => JSON.parse(row.content) as CrewFinish)
        .filter((item) => item.taskShortId === crew.shortId);
}

function ids(crew: Crew) {
    return { agentId: crew.agentId, serverId: fixture.serverId };
}

async function readTask(crew: Crew) {
    return await fixture.owner.trpc.task.get.query({
        serverId: fixture.serverId,
        taskId: crew.id,
    });
}
