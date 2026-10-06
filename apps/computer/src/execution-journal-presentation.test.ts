import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentExecutionJournalSchema } from '@haus/api';
import { toolFailure, turnFailure } from './execution-journal-failure.ts';
import { pathRelativizer, presentExecutionJournal } from './execution-journal-presentation.ts';
import type { ComputerExecutionJournalDocument } from './harness/execution-journal.ts';

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function agentRoot() {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-journal-present-')));
    roots.push(root);
    const agent = join(root, 'servers', 'srv_present', 'agents', 'agt_present');
    await mkdir(join(agent, 'workspace'), { recursive: true });
    await mkdir(join(agent, 'home'), { recursive: true });
    return agent;
}

/** Shaped after a real Claude Code turn: three sub-agents, failed Glob/Grep children. */
function claudeDelegationJournal(agent: string): ComputerExecutionJournalDocument {
    const workspace = join(agent, 'workspace');
    return {
        endedAt: '2026-10-06T17:41:50.838Z',
        runId: 'run_present',
        startedAt: '2026-10-06T17:40:26.192Z',
        status: 'completed',
        tools: [
            {
                startedAt: '2026-10-06T17:40:30.275Z',
                status: 'completed',
                subagent: {
                    label: 'Security review',
                    latestAction: `Reading ${workspace}/projects/tinylink/src/shorten.ts`,
                    startedAt: '2026-10-06T17:40:30.275Z',
                    status: 'completed',
                    usage: { durationMs: 19_118, toolUses: 6, totalTokens: 26_420 },
                },
                toolCallId: 'toolu_security',
                toolName: 'Agent',
            },
            {
                error: '<tool_use_error>Error: No such tool available: Glob. Glob is not available in this session — find files with `find` via the Bash tool instead.</tool_use_error>',
                input: { path: `${workspace}/projects/tinylink`, pattern: 'src/**/*' },
                parentToolCallId: 'toolu_security',
                startedAt: '2026-10-06T17:40:32.299Z',
                status: 'failed',
                toolCallId: 'toolu_glob',
                toolName: 'Glob',
            },
            {
                input: { file_path: `${workspace}/projects/tinylink/src/shorten.ts` },
                output: `1\texport function shorten() {}\n(see ${workspace})`,
                parentToolCallId: 'toolu_security',
                startedAt: '2026-10-06T17:40:34.632Z',
                status: 'completed',
                toolCallId: 'toolu_read',
                toolName: 'Read',
            },
            {
                input: { command: `cat ${join(agent, 'home')}/.claude/settings.json` },
                startedAt: '2026-10-06T17:41:45.193Z',
                status: 'completed',
                toolCallId: 'toolu_bash',
                toolName: 'bash',
            },
        ],
    };
}

test('serves workspace-relative paths, child failure counts, and readable tool errors', async () => {
    const agent = await agentRoot();
    const served = agentExecutionJournalSchema.parse(
        await presentExecutionJournal(claudeDelegationJournal(agent), agent)
    );

    const [parent, glob, read, bash] = served.tools;
    expect(parent?.subagent).toMatchObject({
        failedToolCount: 1,
        latestAction: 'Reading projects/tinylink/src/shorten.ts',
    });
    expect(glob?.input).toEqual({ path: 'projects/tinylink', pattern: 'src/**/*' });
    expect(glob?.failure).toEqual({
        message:
            'No such tool available: Glob. Glob is not available in this session — find files with `find` via the Bash tool instead.',
    });
    // The raw runtime error stays beside the normalized one.
    expect(glob?.error).toStartWith('<tool_use_error>');
    expect(read?.input).toEqual({ file_path: 'projects/tinylink/src/shorten.ts' });
    expect(read?.output).toBe('1\texport function shorten() {}\n(see <workspace>)');
    expect(read?.failure).toBeUndefined();
    expect(bash?.input).toEqual({ command: 'cat ~/.claude/settings.json' });
    expect(JSON.stringify(served)).not.toContain(agent);
});

test('names a failed turn by its terminal error line, not its stack', async () => {
    const agent = await agentRoot();
    const served = await presentExecutionJournal(
        {
            endedAt: '2026-10-06T17:46:01.000Z',
            error: 'Error: Harness session agt_present-1 has an unfinished turn and must be continued before accepting a new prompt.\n    at requirePromptableTurn (/repo/node_modules/@ai-sdk/harness/dist/agent/index.js:3244:15)',
            runId: 'run_failed',
            startedAt: '2026-10-06T17:46:00.000Z',
            status: 'failed',
            tools: [],
        },
        agent
    );
    expect(agentExecutionJournalSchema.parse(served).failure).toEqual({
        message:
            'Harness session agt_present-1 has an unfinished turn and must be continued before accepting a new prompt.',
    });
});

test('normalizes Codex shell failures, Claude exit lines, and Computer codes', () => {
    expect(
        toolFailure({
            exit_code: 1,
            formatted_output: 'ls: /definitely/not/here: No such file or directory\n',
        })
    ).toEqual({ exitCode: 1, message: 'ls: /definitely/not/here: No such file or directory' });
    expect(toolFailure('{"formatted_output":"","exit_code":2}')).toEqual({
        exitCode: 2,
        message: 'Exited with code 2.',
    });
    expect(toolFailure('Exit code 127\nsh: nope: command not found')).toEqual({
        exitCode: 127,
        message: 'sh: nope: command not found',
    });
    expect(toolFailure({ code: 'missing_result' })).toEqual({
        message: 'The runtime never reported a result for this tool.',
    });
    expect(toolFailure({ details: [1, 2] })).toBeUndefined();
    expect(toolFailure(null)).toBeUndefined();
    expect(turnFailure(undefined)).toBeUndefined();
});

test('relativizes only the Agent roots, never a sibling directory', () => {
    const relativize = pathRelativizer([
        { bare: '<workspace>', prefix: '', root: '/data/agt/workspace' },
        { bare: '~', prefix: '~/', root: '/data/agt/home' },
    ]);
    expect(relativize('cd /data/agt/workspace && ls /data/agt/workspace/src')).toBe(
        'cd <workspace> && ls src'
    );
    expect(relativize('/data/agt/workspace-old/a.txt')).toBe('/data/agt/workspace-old/a.txt');
    expect(relativize('/data/agt/home')).toBe('~');
    expect(relativize('no paths here')).toBe('no paths here');
});
