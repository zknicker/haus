import { afterAll, describe, expect, test } from 'bun:test';
import { agentThoughtActionMaxLength } from '@haus/api';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createComputerActivityProjector } from './activity-projector.ts';
import { createComputerActivityRegistry } from './activity-registry.ts';
import { describeFileChange, describeToolAction } from './thought-action.ts';
import { scrubCommandLine } from './thought-action-scrub.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

const shell = (command: string) =>
    describeToolAction({
        classification: { category: 'running_command', outcome: 'activity' },
        input: { command, cwd: '/Users/someone/agent' },
        toolName: 'bash',
    });

describe('action thought scrubbing', () => {
    test('reduces URLs to host and path words', () => {
        expect(
            shell(
                "curl -fsS 'https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.00&current=temperature_2m'"
            )
        ).toBe('curl -fsS api.open-meteo.com/v1/forecast');
        expect(
            shell(
                '/bin/zsh -lc "curl -sL \'https://api.weather.gov/gridpoints/OKX/33,42/forecast\'"'
            )
        ).toBe('curl -sL api.weather.gov/gridpoints/OKX/forecast');
        expect(scrubCommandLine('git clone https://bot:hunter2@github.com/acme/app.git')).toBe(
            'git clone github.com/acme/app.git'
        );
    });

    test('strips secrets, tokens, and emails', () => {
        expect(shell("curl -H 'Authorization: Bearer abc123' https://api.github.com/user")).toBe(
            'curl -H Authorization: Bearer … api.github.com/user'
        );
        expect(shell('GITHUB_TOKEN=ghp_0123456789abcdefghijABCDEFGHIJ gh run list')).toBe(
            'GITHUB_TOKEN=… gh run list'
        );
        expect(shell('mytool --api-key=abc --password hunter2 -u admin:pw sync')).toBe(
            'mytool --api-key=… --password … -u … sync'
        );
        expect(shell("curl -H 'User-Agent: cove (ops@example.com)' https://wttr.in/NYC")).toBe(
            'curl -H User-Agent: cove wttr.in/NYC'
        );
        expect(shell('echo sk-live-abcdefgh and QWxhZGRpbjpvcGVuIHNlc2FtZQQWxhZGRpbjpv')).toBe(
            'echo … and …'
        );
    });

    test('keeps a path basename and caps the line', () => {
        expect(shell('cat /Users/someone/work/notes/launch-checklist.md')).toBe(
            'cat launch-checklist.md'
        );
        const long = shell(`echo ${'word '.repeat(80)}`) ?? '';
        expect(long.length).toBeLessThanOrEqual(agentThoughtActionMaxLength);
        expect(long.endsWith('word')).toBe(true);
    });
});

describe('action thought descriptions', () => {
    test('describes files by basename, web work, and tools with short args', () => {
        const act = (
            category:
                | 'browsing'
                | 'editing_files'
                | 'reading_files'
                | 'searching_web'
                | 'using_tool',
            input: unknown,
            toolName = 'tool'
        ) =>
            describeToolAction({
                classification: { category, outcome: 'activity' },
                input,
                toolName,
            });
        expect(act('reading_files', { file_path: '/Users/someone/agent/MEMORY.md' })).toBe(
            'read MEMORY.md'
        );
        expect(act('editing_files', { path: 'notes/pricing.md' })).toBe('edit pricing.md');
        expect(act('reading_files', { path: 'src', pattern: 'TODO' })).toBe(
            'search files for TODO in src'
        );
        expect(act('searching_web', { query: 'NYC 3-day forecast' })).toBe(
            'web search: NYC 3-day forecast'
        );
        expect(act('browsing', { url: 'https://www.weather.gov/okx/?token=abc' })).toBe(
            'browse www.weather.gov/okx'
        );
        expect(
            act(
                'using_tool',
                { body: { nested: true }, team: 'PRD', title: 'Fix login for ops@example.com' },
                'mcp__linear__create_issue'
            )
        ).toBe('linear create_issue team: PRD title: Fix login for');
        expect(
            act(
                'using_tool',
                { api_key: 'abc123', password: 'hunter2pass', username: 'zach' },
                'mcp__db__login'
            )
        ).toBe('db login username: zach');
        expect(describeFileChange({ event: 'add', path: 'drafts/tip.md' })).toBe('create tip.md');
        expect(describeFileChange({})).toBeNull();
    });

    test('never describes haus bookkeeping, message work, or an input it cannot read', () => {
        expect(
            describeToolAction({
                classification: { outcome: 'skip' },
                input: { command: 'haus task claim --message-id x' },
                toolName: 'bash',
            })
        ).toBeNull();
        expect(
            describeToolAction({
                classification: { category: 'checking_messages', outcome: 'activity' },
                input: {},
                toolName: 'haus_message_check',
            })
        ).toBeNull();
        expect(
            describeToolAction({
                classification: { category: 'editing_files', outcome: 'activity' },
                input: {},
                toolName: 'apply_patch',
            })
        ).toBeNull();
    });

    test('the projector offers real actions and skips haus CLI calls', async () => {
        const offered: (string | null)[] = [];
        const projector = createComputerActivityProjector({
            activity: new AgentActivityRun(runtime, () => undefined),
            registry: createComputerActivityRegistry(),
            runtimeId: 'codex',
            thoughts: { close() {}, observe() {}, observeAction: (action) => offered.push(action) },
        });
        const call = async (toolCallId: string, command: string) =>
            await projector.observe({
                input: { command },
                providerExecuted: true,
                toolCallId,
                toolName: 'bash',
                type: 'tool-call',
            });
        await call('c1', 'haus task claim --target "#all" --message-id ClWDtd8V');
        await call('c2', "haus message send --target '#all' <<'HAUSMSG'\nOn it\nHAUSMSG");
        await call('c3', "curl -fsS 'https://api.open-meteo.com/v1/forecast?latitude=40.7'");
        await call('c4', 'haus message check && curl https://wttr.in/NYC');
        expect(offered.filter(Boolean)).toEqual([
            'curl -fsS api.open-meteo.com/v1/forecast',
            'haus message check && curl wttr.in/NYC',
        ]);
    });
});
