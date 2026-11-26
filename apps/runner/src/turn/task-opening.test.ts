import { afterEach, expect, test } from 'bun:test';
import { type RunnerSessionPolicy, taskWarmIdleMs } from '@haus/api';
import { captainSession } from '../runner-drive-routes.ts';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';
import { composeTaskOpening } from './task-opening.ts';

afterEach(drainCleanups);

const replay = {
    brief: null,
    messages: [
        {
            author: 'orbit',
            body: 'Rotate the signing key.',
            createdAt: '2026-11-26T10:00:00.000Z',
            id: 'msg_brief',
            sequence: 1,
        },
    ],
};

test('a fresh Task session opens with the checkout Haus ran for it, then its chat so far', async () => {
    const queries: string[] = [];
    const { run, server } = await startedRun({
        '/api/agent/tasks/replay': (_body, url) => {
            queries.push(url.search);
            return Response.json(replay);
        },
    });
    const woke = {
        chatId: 'cht_task',
        content: 'Use the new vault.',
        createdAt: '2026-11-26T11:00:00.000Z',
        id: 'msg_woke',
        senderHandle: 'zach',
        senderType: 'human' as const,
        sequence: 4,
        target: 'task:k3mq7xta',
    };
    const opening = composeTaskOpening({
        ...run,
        log: (line) => {
            throw new Error(line);
        },
        policy: taskPolicy({ name: 'haus/haus', ref: 'main' }),
        signal: live(),
        start: { ...run.start, inbox: [woke] },
    });

    expect((await server.frame('invocation-request')) as unknown).toMatchObject({
        operation: { kind: 'repo-checkout', ref: 'main', repository: 'haus/haus' },
        toolCallId: 'task-checkout',
    });
    server.answer({
        outcome: 'completed',
        output: { kind: 'text', text: 'Checked out haus/haus on haus/k3mq7xta-rotate.' },
        runId: 'run_1',
        seq: 0,
        toolCallId: 'task-checkout',
    });
    expect((await opening)?.split('\n')).toEqual([
        '[Haus task checkout] Haus checked out haus/haus at main for you with `haus repo checkout haus/haus --ref main`:',
        'Checked out haus/haus on haus/k3mq7xta-rotate.',
        '',
        '[Haus task history] This session is new, so you start from your chat so far, oldest first. The messages that woke you follow it.',
        '[msg=msg_brief time=2026-11-26T10:00:00.000Z] @orbit: Rotate the signing key.',
    ]);
    expect(queries).toEqual(['?before=4']);
});

test('a Captain’s session opens with nothing of a Task’s', async () => {
    const { run } = await startedRun();
    expect(
        await composeTaskOpening({
            ...run,
            log: () => undefined,
            policy: captainSession('blippy', 'PROD'),
            signal: live(),
        })
    ).toBeNull();
});

function taskPolicy(repo: { name: string; ref: string | null }) {
    const policy: RunnerSessionPolicy = {
        idleCompaction: false,
        kind: 'task',
        memoryPath: null,
        rulePaths: ['haus/AGENTS.md'],
        task: {
            captainHandle: 'orbit',
            driveFolders: ['agents/orbit/reports/k3mq7xta'],
            issues: [],
            repo,
            shortId: 'k3mq7xta',
            title: 'Rotate the signing key',
        },
        warmIdleMs: taskWarmIdleMs,
    };
    return policy;
}
