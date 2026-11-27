import { expect, test } from 'bun:test';
import { isOutsideTaskScope } from '../src/tasks/task-credential-scope.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('a Task credential posts in its own chat and nowhere else', async () => {
    const task = await startCrew('Tidy the changelog.');
    expect(
        await fixture.post('/api/agent/messages/send', task.runner, {
            content: 'On it.',
            nonce: 'task_credential_own',
            target: `task:${task.shortId}`,
        })
    ).toMatchObject({ status: 200 });
    expect(
        await fixture.post('/api/agent/messages/send', task.runner, {
            content: 'Hello channel.',
            nonce: 'task_credential_channel',
            target: '#product',
        })
    ).toMatchObject({ body: { code: 'INVALID_TARGET' }, status: 404 });
});

test('a Task credential cannot start a Task, create an agent or wire a Trigger', async () => {
    const task = await startCrew('Check the release.');
    expect(
        await fixture.post('/api/agent/tasks/start', task.runner, { brief: 'Another one.' })
    ).toMatchObject({ body: { code: 'TASK_START_NOT_CAPTAIN' }, status: 403 });
    expect(
        await fixture.postCreate(task.runner, fixture.createBody({ nonce: 'task_credential' }))
    ).toMatchObject({ body: { code: 'TASK_CREDENTIAL_SCOPE' }, status: 403 });
    expect(
        await fixture.post('/api/agent/triggers', task.runner, { title: 'Watch deploys' })
    ).toMatchObject({ body: { code: 'TASK_CREDENTIAL_SCOPE' }, status: 403 });
});

test('the scope names the routes that change things outside a Task', () => {
    expect(
        [
            '/api/agent/agents',
            '/api/agent/agents/update',
            '/api/agent/artifacts/move',
            '/api/agent/actions/delete-artifact',
            '/api/agent/channels/join',
            '/api/agent/drive/push/put',
            '/api/agent/profile/update',
        ].every(isOutsideTaskScope)
    ).toBe(true);
    expect(
        [
            '/api/agent/drive/write',
            '/api/agent/actions/list-artifacts',
            '/api/agent/issues/update',
            '/api/agent/messages/send',
            '/api/agent/reminders/schedule',
            '/api/agent/tasks/report',
        ].some(isOutsideTaskScope)
    ).toBe(false);
});

async function startCrew(brief: string) {
    const captain = await fixture.mintRunner(`run_task_credential_${crypto.randomUUID()}`);
    const started = await fixture.post('/api/agent/tasks/start', captain, {
        brief,
        machine: fixture.computerId,
    });
    const { shortId } = (started.body as { task?: { shortId: string } }).task ?? { shortId: '' };
    const task = await fixture.owner.trpc.task.get.query({ serverId: fixture.serverId, shortId });
    const runner = await fixture.mintRunner(
        `run_task_credential_${shortId}`,
        task.agentId ?? '',
        task.chatId ?? '',
        false
    );
    return { runner, shortId };
}
