import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { MemoryArtifactStorage } from './artifact-drive-fixture.ts';

const fixture = agentCreationFixture(undefined, { artifactStorage: new MemoryArtifactStorage() });

test('a crew Task writes its report under its Captain’s reports folder, attributed to the Task', async () => {
    const task = await startCrew('Write the launch report.');
    const written = await write(task.runner, `agents/orbit/reports/${task.shortId}/launch.md`, {
        body: '# Launch\nShipped.\n',
        contentType: 'text/markdown',
    });

    expect(written.status).toBe(200);
    expect(written.body).toMatchObject({
        artifact: { path: `agents/orbit/reports/${task.shortId}/launch.md`, size_bytes: 18 },
        citation: `[launch.md](drive://agents/orbit/reports/${task.shortId}/launch.md)`,
    });
    expect(
        await fixture.harness.sql`
            select task_id, author_key from artifact_revisions
            where id = ${(written.body.artifact as { revision_id: string }).revision_id}
        `
    ).toEqual([{ author_key: `agent:${task.agentId}`, task_id: task.id }]);

    const again = await write(task.runner, `agents/orbit/reports/${task.shortId}/launch.md`, {
        body: '# Launch\nShipped twice.\n',
    });
    expect(again.body).toMatchObject({ artifact: { revision_number: 2 } });
});

test('a Task cannot write outside its own folders, nor through the push routes', async () => {
    const task = await startCrew('Write the audit.');
    expect(
        await write(task.runner, 'haus/AGENTS.md', { body: 'Rewrite the rules.' })
    ).toMatchObject({ body: { code: 'DRIVE_WRITE_OUTSIDE_TASK' }, status: 403 });
    expect(
        await write(task.runner, 'agents/orbit/reports/someoneelse/audit.md', { body: 'x' })
    ).toMatchObject({ body: { code: 'DRIVE_WRITE_OUTSIDE_TASK' }, status: 403 });

    const push = await fetch(
        new URL('/api/agent/drive/push/close', fixture.harness.url),
        request(task.runner, { push_id: 'run_task_drive_push' })
    );
    expect(push.status).toBe(403);
    expect(await push.json()).toMatchObject({ code: 'TASK_CREDENTIAL_SCOPE' });
});

test('a Task reads Drive files through the Server, another Task’s deliverable included', async () => {
    const writer = await startCrew('Write the summary.');
    const reader = await startCrew('Read the summary, then write the plan.');
    const summary = `agents/orbit/reports/${writer.shortId}/summary.md`;
    const plan = `agents/orbit/reports/${reader.shortId}/plan.md`;
    await write(writer.runner, summary, { body: 'Summary.\n' });
    await write(reader.runner, plan, { body: 'Plan.\n' });

    for (const path of [summary, plan]) {
        const found = await read(reader.runner, `/api/agent/artifacts/by-path?path=${path}`);
        expect(found).toMatchObject({ body: { artifact: { path } }, status: 200 });
        const { artifact_id: id } = (found.body as { artifact: { artifact_id: string } }).artifact;
        expect(await read(reader.runner, `/api/agent/artifacts/${id}/download`)).toMatchObject({
            body: { artifact: { path }, download_url: expect.any(String) },
            status: 200,
        });
    }
});

test('a Captain is told to edit its drive folder instead', async () => {
    const captain = await fixture.mintRunner('run_task_drive_captain');
    expect(await write(captain, 'agents/orbit/notes.md', { body: 'Notes.' })).toMatchObject({
        body: { code: 'DRIVE_WRITE_USE_FOLDER' },
        status: 409,
    });
});

async function startCrew(brief: string) {
    const captain = await fixture.mintRunner(`run_task_drive_${crypto.randomUUID()}`);
    const started = await fetch(
        new URL('/api/agent/tasks/start', fixture.harness.url),
        request(captain, { brief, machine: fixture.computerId })
    );
    const { shortId } = ((await started.json()) as { task: { shortId: string } }).task;
    const task = await fixture.owner.trpc.task.get.query({ serverId: fixture.serverId, shortId });
    const runner = await fixture.mintRunner(
        `run_task_drive_${task.shortId}`,
        task.agentId ?? '',
        task.chatId ?? '',
        false
    );
    return { agentId: task.agentId, id: task.id, runner, shortId: task.shortId };
}

async function write(
    runner: { token: string },
    path: string,
    input: { body: string; contentType?: string }
) {
    const response = await fetch(
        new URL('/api/agent/drive/write', fixture.harness.url),
        request(runner, {
            contentBase64: Buffer.from(input.body).toString('base64'),
            ...(input.contentType ? { contentType: input.contentType } : {}),
            path,
            requestId: crypto.randomUUID(),
        })
    );
    return {
        body: (await response.json()) as Record<string, unknown> & { code?: string },
        status: response.status,
    };
}

async function read(runner: { token: string }, path: string) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        headers: { authorization: `Bearer ${runner.token}` },
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}

function request(runner: { token: string }, body: unknown) {
    return {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    };
}
