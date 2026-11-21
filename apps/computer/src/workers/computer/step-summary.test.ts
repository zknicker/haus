import { expect, test } from 'bun:test';
import { createJournalRedactor } from '../../execution-journal-upload/journal-redaction.ts';
import { workerStepRecorder, workerStepReporter, workerTextMask } from './step-summary.ts';

const token = 'hwt_turntokenvalue0123456789';
const claude = (toolCallId: string, nativeName: string, input: unknown) =>
    ({
        input,
        nativeName,
        providerExecuted: true,
        toolCallId,
        toolName: nativeName.toLowerCase(),
        type: 'tool-call',
    }) as const;

test('Claude Code tool calls become read, edit, run and search steps with edit line counts', () => {
    const recorder = workerStepRecorder(createJournalRedactor([token]));
    recorder.offer(claude('t1', 'Read', { file_path: 'src/app.ts' }));
    recorder.offer(
        claude('t2', 'Edit', {
            file_path: 'src/app.ts',
            new_string: 'a\nb\nc\n',
            old_string: 'a\n',
        })
    );
    recorder.offer(claude('t3', 'Write', { content: 'one\ntwo', file_path: 'notes.md' }));
    recorder.offer(claude('t4', 'Grep', { pattern: 'TODO' }));
    recorder.offer(claude('t5', 'Bash', { command: `curl -H "Authorization: Bearer ${token}" x` }));
    recorder.offer(claude('t6', 'TodoWrite', { todos: [] }));
    recorder.offer({
        nativeName: 'Bash',
        output: { stderr: '', stdout: `ok ${token}\n` },
        providerExecuted: true,
        toolCallId: 't5',
        toolName: 'bash',
        type: 'tool-result',
    });
    recorder.offer({ error: 'denied', toolCallId: 't2', toolName: 'edit', type: 'tool-error' });

    expect(recorder.steps()).toEqual([
        {
            additions: null,
            deletions: null,
            kind: 'read',
            label: 'src/app.ts',
            output: null,
            state: 'running',
        },
        {
            additions: 3,
            deletions: 1,
            kind: 'edit',
            label: 'src/app.ts',
            output: null,
            state: 'failed',
        },
        {
            additions: 2,
            deletions: null,
            kind: 'edit',
            label: 'notes.md',
            output: null,
            state: 'running',
        },
        {
            additions: null,
            deletions: null,
            kind: 'search',
            label: 'TODO',
            output: null,
            state: 'running',
        },
        {
            additions: null,
            deletions: null,
            kind: 'run',
            label: 'curl -H "Authorization: Bearer [redacted]" x',
            output: 'ok [redacted]',
            state: 'done',
        },
    ]);
});

test('Codex reads, commands and file changes become steps; a read location claims its call', () => {
    const recorder = workerStepRecorder(createJournalRedactor([]));
    recorder.offer({ path: 'README.md', toolCallId: 'c1', type: 'tool-read-location' });
    recorder.offer({
        input: {},
        invalid: true,
        nativeName: 'exec_command',
        toolCallId: 'c1',
        toolName: 'bash',
        type: 'tool-call',
    });
    recorder.offer({
        input: { command: ['git', 'commit', '-m', 'x'] },
        nativeName: 'exec_command',
        toolCallId: 'c2',
        toolName: 'bash',
        type: 'tool-call',
    });
    recorder.offer({
        isError: true,
        nativeName: 'exec_command',
        output: { exit_code: 1, formatted_output: 'nothing to commit\n' },
        toolCallId: 'c2',
        toolName: 'bash',
        type: 'tool-result',
    });
    recorder.offer({
        input: { additions: 4, deletions: 2, event: 'modify', path: 'src/a.ts' },
        toolCallId: 'c3:0',
        toolName: 'fileChange',
        type: 'tool-call',
    });
    recorder.offer({ input: {}, toolCallId: 'c3', toolName: 'apply_patch', type: 'tool-call' });

    expect(recorder.steps()).toEqual([
        {
            additions: null,
            deletions: null,
            kind: 'read',
            label: 'README.md',
            output: null,
            state: 'running',
        },
        {
            additions: null,
            deletions: null,
            kind: 'run',
            label: 'git commit -m x',
            output: 'nothing to commit',
            state: 'failed',
        },
        {
            additions: 4,
            deletions: 2,
            kind: 'edit',
            label: 'src/a.ts',
            output: null,
            state: 'running',
        },
    ]);
});

test('a turn keeps its newest 40 steps and sends them whole at most once per interval', () => {
    let now = 0;
    const frames: unknown[] = [];
    const reporter = workerStepReporter({
        attempt: 2,
        now: () => now,
        redact: createJournalRedactor([token]),
        send: (frame) => frames.push(frame),
        turnId: 'wkt_1',
    });
    for (let index = 0; index < 45; index += 1) {
        reporter.offer(claude(`t${index}`, 'Read', { file_path: `file-${index}.ts` }));
        now += 100;
    }
    reporter.flush();

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
        attempt: 2,
        steps: [{ label: 'file-0.ts' }],
        turnId: 'wkt_1',
    });
    const last = frames[1] as { steps: { label: string }[] };
    expect(last.steps).toHaveLength(40);
    expect(last.steps[0]?.label).toBe('file-5.ts');
    expect(last.steps[39]?.label).toBe('file-44.ts');
});

test('a step names Worker files from its checkout and drive folder, never by machine path', () => {
    const mask = workerTextMask({
        checkout: '/Users/me/.haus/computer/servers/srv_1/workers/wkr_1/checkout',
        drive: '/Users/me/.haus/computer/servers/srv_1/workers/wkr_1/drive',
        environment: {},
        token,
    });
    const recorder = workerStepRecorder(mask);
    recorder.offer({
        input: {
            additions: 1,
            deletions: 0,
            event: 'create',
            path: '/Users/me/.haus/computer/servers/srv_1/workers/wkr_1/drive/agents/a/reports/X-1/r.md',
        },
        toolCallId: 'c1',
        toolName: 'fileChange',
        type: 'tool-call',
    });
    recorder.offer(claude('t1', 'Bash', { command: 'pwd' }));
    recorder.offer({
        nativeName: 'Bash',
        output: { stdout: '/Users/me/.haus/computer/servers/srv_1/workers/wkr_1/checkout\n' },
        toolCallId: 't1',
        toolName: 'bash',
        type: 'tool-result',
    });

    expect(recorder.steps().map((step) => [step.label, step.output])).toEqual([
        ['drive/agents/a/reports/X-1/r.md', null],
        ['pwd', '.'],
    ]);
});

test('a secret the harness inherited from its environment never reaches a step', () => {
    const awsSecret = 'wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY';
    const mask = workerTextMask({
        checkout: '/w/checkout',
        drive: '/w/drive',
        environment: { AWS_SECRET_ACCESS_KEY: awsSecret, HOME: '/Users/me' },
        token,
    });
    const recorder = workerStepRecorder(mask);
    recorder.offer(claude('t1', 'Bash', { command: 'printenv AWS_SECRET_ACCESS_KEY HOME' }));
    recorder.offer({
        nativeName: 'Bash',
        output: { stdout: `${awsSecret}\n/Users/me\n` },
        toolCallId: 't1',
        toolName: 'bash',
        type: 'tool-result',
    });

    expect(recorder.steps().map((step) => step.output)).toEqual(['[redacted]\n/Users/me']);
});
