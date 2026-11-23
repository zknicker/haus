import { afterEach, describe, expect, test } from 'bun:test';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';

afterEach(drainCleanups);

const nextAction =
    'Next action: Run `haus repo checkout <owner/name> [--ref <ref>]`; `haus repo list` shows the repos with a folder on each Computer.';

describe('haus repo checkout on the runner', () => {
    test('sends a repo-checkout invocation and returns the receipt', async () => {
        const { run, server } = await startedRun();

        const checkout = run.tools.bash(
            'toolu_1',
            { command: 'haus repo checkout Haus/Haus --ref release/28' },
            live()
        );

        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { kind: 'repo-checkout', ref: 'release/28', repository: 'haus/haus' },
            runId: 'run_1',
            seq: 0,
            timeoutMs: 300_000,
            toolCallId: 'toolu_1',
            type: 'invocation-request',
        });
        const receipt =
            'Checked out haus/haus at /Users/kit/.haus/computer/servers/srv_1/worktrees/agt_1/haus/haus on haus/agt_1/haus.';
        server.answer({
            outcome: 'completed',
            output: { kind: 'text', text: receipt },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });
        expect(await checkout).toEqual({
            content: [{ text: receipt, type: 'text' }],
            invocation: 'completed',
            isError: false,
        });
        expect(server.requests).toEqual([]);
    });

    test("a checkout with no --ref sends a null ref, and the Server's refusal reads as an error", async () => {
        const { run, server } = await startedRun();

        const checkout = run.tools.bash(
            'toolu_1',
            { command: 'haus repo checkout acme/app' },
            live()
        );

        expect((await server.frame('invocation-request')) as unknown).toMatchObject({
            operation: { kind: 'repo-checkout', ref: null, repository: 'acme/app' },
        });
        const refusal =
            'mini has no folder for acme/app. Its folders: haus/haus. Ask the person who attached mini to add one.';
        server.answer({
            outcome: 'failed',
            output: { kind: 'text', text: refusal },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });
        expect(await checkout).toEqual({
            content: [{ text: refusal, type: 'text' }],
            invocation: 'failed',
            isError: true,
        });
    });

    test.each([
        ['haus repo checkout', 'Expected 1 argument (<owner/name>), got 0.'],
        ['haus repo checkout haus/haus --force', "Unknown flag '--force' for 'haus repo checkout'."],
        ['haus repo checkout haus', 'Invalid repository "haus". A repo reads as owner/name.'],
        [`haus repo checkout haus/haus --ref ${'r'.repeat(201)}`, 'The ref must be 1 to 200 characters.'],
    ])('a usage error sends nothing: %s', async (command, message) => {
        const { run, server } = await startedRun();

        expect(await run.tools.bash('toolu_1', { command }, live())).toEqual({
            content: [
                {
                    text: [`Error: ${message}`, 'Code: INVALID_ARG', nextAction].join('\n'),
                    type: 'text',
                },
            ],
            isError: true,
        });
        expect(server.received.map((frame) => frame.type)).not.toContain('invocation-request');
        expect(server.requests).toEqual([]);
    });

    test('help runs the Agent CLI and sends no invocation', async () => {
        const { run, server } = await startedRun();

        const help = await run.tools.bash(
            'toolu_1',
            { command: 'haus repo checkout --help' },
            live()
        );

        expect(help.isError).toBe(false);
        expect(help.content[0]).toMatchObject({ type: 'text' });
        expect((help.content[0] as { text: string }).text).toContain(
            'haus repo checkout <owner/name> [--ref <ref>]'
        );
        expect(server.received.map((frame) => frame.type)).not.toContain('invocation-request');
    });
});
