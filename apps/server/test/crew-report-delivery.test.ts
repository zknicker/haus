import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentCommand, CrewReportAttention } from '@haus/api';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { settleCrewTurn } from '../src/tasks/crew-turn-settlement.ts';
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
    orbit = await fixture.mintRunner('run_crew_report_orbit');
});

afterAll(async () => {
    await connection?.close();
});

test('a report on a turn the Captain directed posts in the Task and reaches the Captain', async () => {
    const crew = await startCrew('Rotate the signing key.');
    const runId = await takeQueuedTurn(crew);
    const report = await reportAs(crew, runId, {
        outcome: 'done',
        text: 'Rotated the key and updated the deploy secret.',
    });
    expect(report).toMatchObject({ body: { reachesCaptain: true }, status: 200 });
    const page = await fixture.owner.trpc.chat.messages.query({
        chatId: crew.chatId,
        serverId: fixture.serverId,
    });
    expect(page.messages.at(-1)).toMatchObject({
        author: { agentId: crew.agentId, kind: 'agent' },
        content: 'Rotated the key and updated the deploy secret.',
    });
    expect(await crewReports()).toContainEqual(
        expect.objectContaining({
            id: `crew-report:${crew.id}:${runId}`,
            outcome: 'done',
            taskShortId: crew.shortId,
            text: 'Rotated the key and updated the deploy secret.',
        })
    );
});

test('a directed turn that settles with no report sends one unreported receipt', async () => {
    const crew = await startCrew('Audit the member directory copy.');
    const runId = await takeQueuedTurn(crew);
    await connection.db.transaction(async (tx) => {
        await settleCrewTurn(tx, { ...ids(crew), runId, status: 'completed' });
        await settleCrewTurn(tx, { ...ids(crew), runId, status: 'completed' });
    });
    const receipts = (await crewReports()).filter((item) => item.taskShortId === crew.shortId);
    expect(receipts).toEqual([
        expect.objectContaining({ id: `crew-report:${crew.id}:${runId}`, outcome: 'unreported' }),
    ]);
});

test('a turn a person drove reaches the Captain only when it fails or asks for help', async () => {
    const crew = await startCrew('Profile the nightly export.');
    await takeQueuedTurn(crew);
    await fixture.owner.trpc.chat.send.mutate({
        chatId: crew.chatId,
        content: 'Can you also check the index?',
        nonce: createOpaqueId('non'),
        serverId: fixture.serverId,
    });
    const personRun = await takeQueuedTurn(crew);
    const done = await reportAs(crew, personRun, { outcome: 'done', text: 'The index is fine.' });
    expect(done.body.reachesCaptain).toBe(false);
    await connection.db.transaction((tx) =>
        settleCrewTurn(tx, { ...ids(crew), runId: personRun, status: 'completed' })
    );
    expect((await crewReports()).map((item) => item.id)).not.toContain(
        `crew-report:${crew.id}:${personRun}`
    );
    await connection.db.transaction((tx) =>
        settleCrewTurn(tx, { ...ids(crew), runId: 'run_person_failed', status: 'failed' })
    );
    expect(await crewReports()).toContainEqual(
        expect.objectContaining({
            id: `crew-report:${crew.id}:run_person_failed`,
            outcome: 'failed',
        })
    );
});

test('needs-you naming a person mentions them, wakes no Captain, and waits on them', async () => {
    const crew = await startCrew('Ship the avatar upload flow.');
    const runId = await takeQueuedTurn(crew);
    const asked = await reportAs(crew, runId, {
        ask: 'Ship it behind the flag?',
        outcome: 'needs-you',
        person: 'ada',
        text: 'The upload works; the flag is still off.',
    });
    expect(asked).toMatchObject({ body: { reachesCaptain: false }, status: 200 });
    const posted = await fixture.harness.sql`
        select mentioned_user_ids from chat_messages
        where chat_id = ${crew.chatId} and author_agent_id = ${crew.agentId}
    `;
    expect(posted).toEqual([{ mentioned_user_ids: [fixture.ownerUserId] }]);
    expect(await readTask(crew)).toMatchObject({ activity: 'waiting', needsYou: true });
    await fixture.owner.trpc.chat.send.mutate({
        chatId: crew.chatId,
        content: 'Yes, behind the flag.',
        nonce: createOpaqueId('non'),
        serverId: fixture.serverId,
    });
    expect((await readTask(crew)).needsYou).toBe(false);

    const unknown = await reportAs(crew, runId, {
        outcome: 'needs-you',
        person: 'nobody-here',
        text: 'Who decides?',
    });
    expect(unknown).toMatchObject({ body: { code: 'TASK_PERSON_UNKNOWN' }, status: 400 });
});

test('crew reports from several Tasks of one Captain ride one run', async () => {
    const first = await startCrew('Patch the login bug.');
    const second = await startCrew('Patch the logout bug.');
    for (const crew of [first, second]) {
        const runId = await takeQueuedTurn(crew);
        await reportAs(crew, runId, { outcome: 'done', text: `Patched for ${crew.shortId}.` });
    }
    await fixture.harness.sql`
        update agent_inbox set state = 'seen', seen_at = now()
        where agent_id = ${fixture.orbitAgentId} and source <> 'crew_report' and state = 'queued'
    `;
    const runner = new RecordingRunner();
    runner.attach(fixture.orbitAgentId);
    const transport = { isOnline: () => true, send: () => true };
    const delivery = new AgentDelivery(connection.db, transport, undefined, runner);
    await delivery.dispatchAgent(fixture.orbitAgentId, fixture.serverId);
    const start = runner.starts()[0] as Extract<AgentCommand, { type: 'start' }> | undefined;
    const shortIds = (start?.crewReports ?? []).map((item) => item.taskShortId);
    expect(shortIds).toEqual(expect.arrayContaining([first.shortId, second.shortId]));
    expect(start).toMatchObject({ chatId: null, inboxDelivery: 'concrete' });
});

test('an Issue assigned to a Task wakes the Task agent; its own edits ride its report', async () => {
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
    await reportAs(crew, runId, { outcome: 'done', text: 'Rotated.' });
    expect(await crewReports()).toContainEqual(
        expect.objectContaining({
            issueCodes: [issue.code],
            issueEdits: [{ change: 'state todo → in_progress', code: issue.code }],
            taskShortId: crew.shortId,
        })
    );
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
    const response = await fetch(new URL('/api/agent/tasks/start', fixture.harness.url), {
        body: JSON.stringify({ brief, issue, machine: fixture.computerId }),
        headers: { authorization: `Bearer ${orbit.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const reply = (await response.json()) as { task: { shortId: string } };
    const task = await fixture.owner.trpc.task.get.query({
        serverId: fixture.serverId,
        shortId: reply.task.shortId,
    });
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

async function reportAs(crew: Crew, runId: string, body: Record<string, unknown>) {
    const runner = await fixture.mintRunner(runId, crew.agentId, crew.chatId, false);
    const response = await fetch(new URL('/api/agent/tasks/report', fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return {
        body: (await response.json()) as { code?: string; reachesCaptain?: boolean },
        status: response.status,
    };
}

async function crewReports() {
    const rows = (await fixture.harness.sql`
        select content from agent_inbox
        where agent_id = ${fixture.orbitAgentId} and source = 'crew_report'
        order by created_at
    `) as { content: string }[];
    return rows.map((row) => JSON.parse(row.content) as CrewReportAttention);
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
