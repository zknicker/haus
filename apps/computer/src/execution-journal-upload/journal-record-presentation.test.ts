import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    agentExecutionJournalSchema,
    type ExecutionJournalDocument,
    executionJournalUploadRecordSchema,
    presentExecutionJournal,
    replayExecutionJournalUpload,
} from '@haus/api';
import { createJournalRecordPresenter, pathRelativizer } from './journal-record-presentation.ts';

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
    await mkdir(join(agent, 'runtime'), { recursive: true });
    return agent;
}

/** Shaped after a real Claude Code turn: three sub-agents, failed Glob/Grep children. */
function claudeDelegationJournal(agent: string): ExecutionJournalDocument {
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

async function upload(agent: string, document: ExecutionJournalDocument, secrets: string[] = []) {
    const present = await createJournalRecordPresenter({ agentRoot: agent, knownSecrets: secrets });
    const records = present({ document, type: 'open' });
    for (const record of records) {
        expect(executionJournalUploadRecordSchema.safeParse(record).success).toBe(true);
    }
    return { present, records };
}

test('uploads workspace-relative paths the Server serves with child failures and readable errors', async () => {
    const agent = await agentRoot();
    const { records } = await upload(agent, claudeDelegationJournal(agent));
    expect(records.map((record) => record.type)).toEqual(['open', 'tool', 'tool', 'tool', 'tool']);
    const replayed = replayExecutionJournalUpload(records);
    const served = agentExecutionJournalSchema.parse(presentExecutionJournal(replayed!));

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
    expect(bash?.input).toEqual({ command: 'cat ~/.claude/settings.json' });
    expect(JSON.stringify(records)).not.toContain(agent);
});

test('masks the Agent token, Computer secrets, and secret-named fields in every record kind', async () => {
    const agent = await agentRoot();
    const proxyToken = `grta_${'a'.repeat(43)}`;
    await writeFile(join(agent, 'runtime', 'proxy-token'), `${proxyToken}\n`);
    const { present } = await upload(agent, claudeDelegationJournal(agent), ['hunter2-computer']);
    const presented = [
        ...present({
            input: { command: `curl -H "Authorization: Bearer ${proxyToken}" x`, apiKey: 'k-123' },
            occurredAt: '2026-10-06T17:40:00.000Z',
            toolCallId: 'call_curl',
            toolName: 'bash',
            type: 'tool-call',
        }),
        ...present({
            isError: false,
            occurredAt: '2026-10-06T17:40:01.000Z',
            output: { stderr: 'ok\u0000done', stdout: 'HAUS_SECRET=hunter2-computer' },
            preliminary: false,
            toolCallId: 'call_curl',
            toolName: 'bash',
            type: 'tool-result',
        }),
        ...present({ id: 'think', text: `token is ${proxyToken}`, type: 'reasoning-append' }),
        ...present({
            at: '2026-10-06T17:40:02.000Z',
            error: 'auth failed for hunter2-computer',
            status: 'failed',
            type: 'finish',
        }),
    ];
    const serialized = JSON.stringify(presented);
    expect(serialized).not.toContain(proxyToken);
    expect(serialized).not.toContain('hunter2-computer');
    expect(serialized).not.toContain('k-123');
    expect(serialized).not.toContain('\\u0000');
    expect(presented[0]).toMatchObject({ input: { apiKey: '[redacted]' } });
    expect(presented[1]).toMatchObject({
        output: { stderr: 'okdone', stdout: 'HAUS_SECRET=[redacted]' },
    });
    expect(presented[2]).toMatchObject({ text: 'token is [redacted]' });
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
