import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import { harnessAppOrigin } from './haus-server-harness.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

let setup: InvocationHarness;
let runner: RunnerClient;
let computer: FrameClient;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'repo-checkout-gate' });
    await setup.harness.sql`
        update computers set reported_inventory = reported_inventory || '{"name":"Studio"}'::jsonb
        where id = ${setup.computerId}
    `;
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    computer = await connectComputer(setup.harness, setup.computerCredential);
});

afterAll(async () => {
    runner?.close();
    computer?.close();
    await setup?.close();
});

test('a checkout of a repo with no folder there is refused with the folders and who adds one', async () => {
    await addFolder('haus/site', '/Users/ada/src/site');
    checkout('run_none', 'toolu_none', 'Zed/Unknown');

    const answer = await runner.next(
        frameOfType('invocation-result', { toolCallId: 'toolu_none' })
    );

    const link = `${harnessAppOrigin}/s/repo-checkout-gate/settings/computers/${setup.computerId}`;
    expect(answer).toMatchObject({ outcome: 'failed' });
    expect((answer.output as { text: string }).text).toBe(
        `Studio has no folder for zed/unknown, so \`haus repo checkout\` can't make a worktree there. Studio's repo folders: haus/site (/Users/ada/src/site). Ask @ada, who attached Studio, to add one in Settings → Devices → Studio → Repositories (${link}), or with \`haus-computer repo add <path>\` on that machine. Then try again.`
    );
    expect(computer.frames.filter((frame) => frame.runId === 'run_none')).toEqual([]);
    expect(
        await setup.harness.sql`
            select state, outcome from agent_invocations where run_id = 'run_none'`
    ).toEqual([{ outcome: 'failed', state: 'finished' }]);
});

test("a checkout reaches the Computer with the folder the Server knows, never the runner's", async () => {
    await addFolder('haus/haus', '/Users/ada/src/haus');
    checkout('run_folder', 'toolu_folder', 'Haus/Haus', '/tmp/elsewhere');

    const invoke = await computer.next(frameOfType('invoke', { runId: 'run_folder' }));

    expect(invoke.operation).toEqual({
        folder: '/Users/ada/src/haus',
        kind: 'repo-checkout',
        ref: 'main',
        repository: 'haus/haus',
    });
});

function checkout(runId: string, toolCallId: string, repository: string, folder?: string) {
    runner.send({
        agentId: setup.agentId,
        operation: {
            ...(folder ? { folder } : {}),
            kind: 'repo-checkout',
            ref: runId === 'run_folder' ? 'main' : null,
            repository,
        },
        runId,
        seq: 0,
        sessionGeneration: 1,
        toolCallId,
        type: 'invocation-request',
    });
}

async function addFolder(repository: string, path: string) {
    await setup.harness.sql`
        insert into repos (server_id, repository) values (${setup.serverId}, ${repository})
        on conflict do nothing`;
    await setup.harness.sql`
        insert into repo_folders (server_id, computer_id, repository, path, added_by_user_id)
        values (${setup.serverId}, ${setup.computerId}, ${repository}, ${path}, null)`;
}
