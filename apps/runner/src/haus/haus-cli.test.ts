import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { ToolOutcome } from '../run-context.ts';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';

afterEach(drainCleanups);

describe('haus on the runner', () => {
    test("files push never reads another Agent's session from the runner's disk", async () => {
        const { run, runner, server } = await startedRun();
        const otherSession = join(runner.dataDir, 'agents', 'agt_other', 'session.json');
        await mkdir(join(runner.dataDir, 'agents', 'agt_other'), { recursive: true });
        await writeFile(otherSession, JSON.stringify({ sessionId: 'other-agent-secret' }));
        const relativeSession = `../../${basename(runner.dataDir)}/agents/agt_other/session.json`;

        const absolute = await run.tools.bash(
            'toolu_1',
            { command: `haus files push ${otherSession} leaked.json` },
            live()
        );
        const relative = await run.tools.bash(
            'toolu_2',
            { command: `haus files push ${relativeSession} leaked.json` },
            live()
        );

        expect([absolute, relative]).toEqual([workspaceRefusal, workspaceRefusal]);
        expect(server.requests).toEqual([]);
    });

    test("a trigger payload file is read from the Agent's machine, not the runner's disk", async () => {
        const { run, runner, server } = await startedRun();
        const otherSession = join(runner.dataDir, 'agents', 'agt_other', 'session.json');
        await mkdir(join(runner.dataDir, 'agents', 'agt_other'), { recursive: true });
        await writeFile(otherSession, JSON.stringify({ sessionId: 'other-agent-secret' }));

        const preview = run.tools.bash(
            'toolu_1',
            {
                command: `haus trigger preview --id trg_1 --event push --payload-file ${otherSession}`,
            },
            live()
        );

        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { kind: 'file-read', maxBytes: 268_435_456, path: otherSession },
            runId: 'run_1',
            seq: 0,
            timeoutMs: 60_000,
            toolCallId: 'toolu_1',
            type: 'invocation-request',
        });
        server.answer({ outcome: 'offline', runId: 'run_1', seq: 0, toolCallId: 'toolu_1' });
        expect(await preview).toEqual({
            content: [
                {
                    text: 'The machine is offline. Nothing ran. `haus` and `execute` still work.',
                    type: 'text',
                },
            ],
            invocation: 'offline',
            isError: true,
        });
        expect(server.requests).toEqual([]);
    });
});

const workspaceRefusal = {
    content: [
        {
            text: [
                'Error: `haus files push` moves files between Files and your workspace, which `haus` cannot reach on its own.',
                'Code: HAUS_WORKSPACE_UNREACHABLE',
                'Next action: To share one file, run `haus attachment upload --path <file>` and attach its id to a message.',
            ].join('\n'),
            type: 'text',
        },
    ],
    isError: true,
} satisfies ToolOutcome;
