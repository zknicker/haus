import { beforeAll, describe, expect, test } from 'bun:test';
import {
    agentIssueCommentResponseSchema,
    agentIssueListResponseSchema,
    agentIssueShowResponseSchema,
    agentIssueSingleResponseSchema,
} from '@haus/api';
import * as z from 'zod';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { startTestTask } from './task-place-fixture.ts';

const fixture = agentCreationFixture();
let orbit: { token: string };
let kit: { token: string };
let peer: { token: string };

const refusalSchema = z.object({ code: z.string(), message: z.string() });

async function call(as: { token: string }, path: string, body?: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { authorization: `Bearer ${as.token}`, 'content-type': 'application/json' },
        method: body === undefined ? 'GET' : 'POST',
    });
    return { body: (await response.json()) as unknown, status: response.status };
}

async function write(as: { token: string }, path: string, body: unknown) {
    const reply = await call(as, path, body);
    expect(reply.status).toBe(200);
    return agentIssueSingleResponseSchema.parse(reply.body).issue;
}

async function refused(as: { token: string }, path: string, body: unknown) {
    const reply = await call(as, path, body);
    return { ...refusalSchema.parse(reply.body), status: reply.status };
}

async function show(code: string) {
    const reply = await call(orbit, `/api/agent/issues/show?code=${code}`);
    return agentIssueShowResponseSchema.parse(reply.body);
}

async function file(title: string, body: Record<string, unknown> = {}) {
    return await write(orbit, '/api/agent/issues/create', { title, ...body });
}

beforeAll(async () => {
    const kitAgentId = await fixture.createAgent('Kit', 'kit');
    await fixture.owner.trpc.agent.setHome.mutate({
        agentId: kitAgentId,
        projectId: fixture.channelId,
        serverId: fixture.serverId,
    });
    orbit = await fixture.mintRunner('run_issue_claim_orbit');
    kit = await fixture.mintRunner('run_issue_claim_kit', kitAgentId);
    peer = await fixture.mintRunner('run_issue_claim_peer', fixture.peerAgentId);
});

describe('claiming with --expect-assignee', () => {
    test('takes an unassigned Issue, then refuses a second claimant with ISSUE_TAKEN naming the holder', async () => {
        const issue = await file('Rotate the signing key');
        expect(issue).toMatchObject({ assignee: null, priority: 'normal', state: 'todo' });

        const claimed = await write(orbit, '/api/agent/issues/update', {
            assignee: 'me',
            code: issue.code,
            expectAssignee: null,
        });
        expect(claimed.assignee).toEqual({ handle: 'orbit', kind: 'captain' });

        expect(
            await refused(kit, '/api/agent/issues/update', {
                assignee: 'me',
                code: issue.code,
                expectAssignee: null,
            })
        ).toEqual({
            code: 'ISSUE_TAKEN',
            message: `${issue.code} is assigned to @orbit, not the assignee you expected.`,
            status: 409,
        });

        const handedOver = await write(kit, '/api/agent/issues/update', {
            assignee: 'me',
            code: issue.code,
            expectAssignee: '@orbit',
        });
        expect(handedOver.assignee).toEqual({ handle: 'kit', kind: 'captain' });
    });

    test('a person holding the Issue is named, and the App write fails closed', async () => {
        const issue = await file('Write the launch post', { assignee: '@ada' });
        const taken = await refused(orbit, '/api/agent/issues/update', {
            assignee: 'me',
            code: issue.code,
            expectAssignee: null,
        });
        expect(taken.code).toBe('ISSUE_TAKEN');
        expect(taken.message).toContain('@ada');

        const { issue: record } = await fixture.owner.trpc.issue.get.query({
            code: issue.code,
            serverId: fixture.serverId,
        });
        await expect(
            fixture.owner.trpc.issue.update.mutate({
                expectAssignee: null,
                expectedVersion: record.version,
                issueId: record.id,
                patch: { assignee: null },
                serverId: fixture.serverId,
            })
        ).rejects.toThrow('is assigned to @ada');
    });
});

describe('who writes where', () => {
    test('a former assignee who loses the Issue while its write waits is refused', async () => {
        const issue = await file('Patch the login loop');
        await write(orbit, '/api/agent/issues/update', { assignee: '@peer', code: issue.code });
        const { issue: record } = await fixture.owner.trpc.issue.get.query({
            code: issue.code,
            serverId: fixture.serverId,
        });
        let pending: ReturnType<typeof call> | undefined;
        await fixture.harness.sql.begin(async (tx) => {
            await tx`select id from servers where id = ${fixture.serverId} for update`;
            await tx`
                update issues
                set assignee_agent_id = ${fixture.orbitAgentId}, version = version + 1
                where id = ${record.id}
            `;
            pending = call(peer, '/api/agent/issues/update', {
                code: issue.code,
                priority: 'urgent',
            });
            await waitForLockWaiters(1);
        });
        const reply = await pending;
        expect(reply?.status).toBe(403);
        expect(refusalSchema.parse(reply?.body).code).toBe('ISSUE_PROJECT_NOT_HOME');
        expect((await show(issue.code)).issue).toMatchObject({
            assignee: { handle: 'orbit', kind: 'captain' },
            priority: 'normal',
        });
        for (const [path, body] of [
            ['/api/agent/issues/comment', { body: 'Still mine?', code: issue.code }],
            ['/api/agent/issues/link', { code: issue.code, taskId: 'tsk_none' }],
        ] as const) {
            expect((await refused(peer, path, body)).code).toBe('ISSUE_PROJECT_NOT_HOME');
        }
    });

    test('another Project edits only Issues assigned to it', async () => {
        const issue = await file('Audit the webhooks');
        const denied = await refused(peer, '/api/agent/issues/update', {
            code: issue.code,
            priority: 'urgent',
        });
        expect(denied).toMatchObject({ code: 'ISSUE_PROJECT_NOT_HOME', status: 403 });

        await write(orbit, '/api/agent/issues/update', { assignee: '@peer', code: issue.code });
        const allowed = await write(peer, '/api/agent/issues/update', {
            code: issue.code,
            state: 'in_progress',
        });
        expect(allowed.state).toBe('in_progress');
    });

    test('a parent stays in the Project and never makes a cycle', async () => {
        const parent = await file('Ship the release');
        const child = await file('Write the notes', { parent: parent.code });
        expect(child.parent).toBe(parent.code);
        expect(
            await refused(orbit, '/api/agent/issues/update', {
                code: parent.code,
                parent: child.code,
            })
        ).toMatchObject({ code: 'ISSUE_PARENT_CYCLE', status: 400 });

        const elsewhere = await write(peer, '/api/agent/issues/create', { title: 'Elsewhere' });
        expect(
            await refused(orbit, '/api/agent/issues/update', {
                code: child.code,
                parent: elsewhere.code,
            })
        ).toMatchObject({ code: 'ISSUE_PARENT_PROJECT' });

        await write(orbit, '/api/agent/issues/update', { code: child.code, state: 'done' });
        const shown = await show(parent.code);
        expect(shown.issue).toMatchObject({ closedSubIssueCount: 1, subIssueCount: 1 });
        expect(shown.subIssues.map((sub) => sub.code)).toEqual([child.code]);
        expect(shown.activity.map((row) => row.kind)).toEqual(['created', 'sub_issue_added']);
    });
});

test('replies stay one level deep and the timeline names who did what', async () => {
    const issue = await file('Fix the flaky deploy');
    const comment = async (as: { token: string }, body: Record<string, unknown>) => {
        const reply = await call(as, '/api/agent/issues/comment', { code: issue.code, ...body });
        return agentIssueCommentResponseSchema.parse(reply.body).comment;
    };
    const top = await comment(orbit, { body: 'Seen it twice.' });
    const reply = await comment(kit, { body: 'Same here.', replyTo: top.id });
    const nested = await comment(orbit, { body: 'Fixing it now.', replyTo: reply.id });
    expect(nested).toMatchObject({ parentCommentId: top.id, replyToCommentId: reply.id });

    await write(orbit, '/api/agent/issues/update', {
        assignee: 'me',
        code: issue.code,
        state: 'in_progress',
    });
    const shown = await show(issue.code);
    expect(shown.comments).toHaveLength(3);
    expect(shown.activity.slice(1)).toEqual([
        expect.objectContaining({ from: 'todo', kind: 'state_changed', to: 'in_progress' }),
        expect.objectContaining({ from: 'nobody', kind: 'assignee_changed', to: '@orbit' }),
    ]);

    const mine = agentIssueListResponseSchema.parse(
        (await call(orbit, '/api/agent/issues?assignee=me')).body
    );
    expect(mine.issues.map((row) => row.code)).toContain(issue.code);
});

test('assignee and link take a Task by its short id', async () => {
    const task = await startTestTask(fixture.harness, fixture.owner, {
        channelId: fixture.channelId,
        serverId: fixture.serverId,
        title: 'Crew on the deploy',
    });
    const assigned = await file('Assign by short id', { assignee: `task:${task.shortId}` });
    expect(assigned.assignee).toMatchObject({ kind: 'task', taskId: task.id });

    const linked = await file('Link by short id');
    await write(orbit, '/api/agent/issues/link', { code: linked.code, taskId: task.shortId });
    expect((await show(linked.code)).issue.taskIds).toEqual([task.id]);
});

async function waitForLockWaiters(count: number) {
    const deadline = performance.now() + 2000;
    while (performance.now() < deadline) {
        const [row] = (await fixture.harness.sql`
            select count(*)::int as waiting from pg_stat_activity
            where datname = current_database()
              and pid <> pg_backend_pid()
              and wait_event_type = 'Lock'
        `) as { waiting: number }[];
        if ((row?.waiting ?? 0) >= count) {
            return;
        }
    }
    throw new Error(`Fewer than ${count} writers reached the held Server lock.`);
}
