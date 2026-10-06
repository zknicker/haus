import { afterAll, describe, expect, test } from 'bun:test';
import { agentThoughtResultMaxLength } from '@haus/api';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createComputerActivityProjector } from './activity-projector.ts';
import { createComputerActivityRegistry } from './activity-registry.ts';
import { describesResultAction, thoughtResultExcerpt } from './thought-result.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

describe('result thought excerpts', () => {
    test('reads Codex, stdout, and text-part output as plain lines', () => {
        expect(
            thoughtResultExcerpt({
                exit_code: 0,
                formatted_output:
                    '{\n  "days": [\n    { "day": "Saturday", "summary": "Rain likely", "high": 58 }\n  ]\n}',
            })
        ).toBe('days:\nday: Saturday, summary: Rain likely, high: 58');
        expect(thoughtResultExcerpt({ stderr: '', stdout: 'bun-v1.4.2 released 2026-09-20' })).toBe(
            'bun-v1.4.2 released 2026-09-20'
        );
        expect(
            thoughtResultExcerpt([
                { text: '<h2 class="x">Essential Visit</h2> adults&nbsp;20 euros', type: 'text' },
            ])
        ).toBe('Essential Visit adults 20 euros');
    });

    test('removes secrets, environment values, emails, paths, and URL credentials', () => {
        const excerpt = thoughtResultExcerpt({
            exit_code: 0,
            formatted_output: [
                'Saturday: rain likely, high 58F',
                'GITHUB_TOKEN=ghp_0123456789abcdefghijABCDEFGHIJ HOME=/Users/someone',
                '"api_key":"sk-live-abc123" "password": "hunter2" token: s3cr3t',
                'Authorization: Bearer abc123 by ops@example.com',
                'see /Users/someone/private/plan.md and https://bot:pw@api.example.com/v1/a?key=zzz',
            ].join('\n'),
        });
        expect(excerpt).toBe(
            [
                'Saturday: rain likely, high 58F',
                'GITHUB_TOKEN=… HOME=…',
                'api_key: … password: … token: …',
                'Authorization: Bearer … by',
                'see plan.md and api.example.com/v1/a',
            ].join('\n')
        );
        for (const secret of ['ghp_', 'sk-live', 'hunter2', 's3cr3t', 'abc123', '@', 'zzz', 'pw']) {
            expect(excerpt).not.toContain(secret);
        }
    });

    test('removes the value of a spaced secret assignment, as in TOML or source', () => {
        const excerpt = thoughtResultExcerpt({
            exit_code: 0,
            formatted_output: [
                'password = hunter2secret',
                'api_key = "abc12345"',
                'const dbPassword = "hunter3" in the staging config',
            ].join('\n'),
        });
        expect(excerpt).toBe(
            ['password=…', 'api_key=…', 'const dbPassword=… in the staging config'].join('\n')
        );
    });

    test('skips failures, status codes, and empty output, and caps long output', () => {
        expect(thoughtResultExcerpt({ exit_code: 1, formatted_output: 'curl: (6) no host' })).toBe(
            null
        );
        expect(thoughtResultExcerpt({ exit_code: 0, formatted_output: '200\n' })).toBe(null);
        expect(thoughtResultExcerpt({ suppress: false })).toBe(null);
        const long = thoughtResultExcerpt(`${'Sunny and mild all weekend. '.repeat(40)}`);
        expect(long?.length).toBeLessThanOrEqual(agentThoughtResultMaxLength);
        // Cut on a word boundary: every word survives whole.
        expect(
            long?.split(' ').every((word) => /^(?:Sunny|and|mild|all|weekend\.)$/u.test(word))
        ).toBe(true);
    });

    test('never keeps output of file work or secret-reading actions', () => {
        expect(
            describesResultAction('running_command', 'curl api.open-meteo.com/v1/forecast')
        ).toBe(true);
        expect(describesResultAction('reading_files', 'read launch-checklist.md')).toBe(false);
        expect(describesResultAction('editing_files', 'edit MEMORY.md')).toBe(false);
        for (const action of [
            'printenv',
            'env',
            'cat .env.local',
            'op read op://vault/item',
            'security find-generic-password -s x',
            'curl -H Authorization: Bearer … api.github.com/user',
            'gh auth token',
            // Haus bookkeeping inside a compound command, and the Agent's own files.
            'cat MEMORY.md && haus task update --help',
            'ls notes/ && cat notes/onboarding.md',
            // Shell commands that print files return their contents, like a file read.
            'cat config.toml',
            'sed -n 1,80p db.ts',
            'cd app && rg password src',
            'git diff HEAD',
        ]) {
            expect(describesResultAction('running_command', action)).toBe(false);
        }
        expect(describesResultAction('running_command', null)).toBe(false);
        expect(
            describesResultAction('running_command', 'curl -fsS wttr.in/Chicago | grep Saturday')
        ).toBe(true);
        // A long field name scrubbed as token-like is not a secret: its output may ride.
        expect(
            describesResultAction(
                'running_command',
                'curl -fsS api.open-meteo.com/v1/forecast | jq {daily:[.daily.…]}'
            )
        ).toBe(true);
    });

    test('the projector offers a finished real action with its result, once', async () => {
        const offered: { action: string | null; result?: string }[] = [];
        const projector = createComputerActivityProjector({
            activity: new AgentActivityRun(runtime, () => undefined),
            registry: createComputerActivityRegistry(),
            runtimeId: 'codex',
            thoughts: {
                close() {},
                observe() {},
                observeAction: (action, result) =>
                    offered.push(result ? { action, result } : { action }),
            },
        });
        const run = async (toolCallId: string, command: string, output: unknown) => {
            const base = { providerExecuted: true, toolCallId, toolName: 'bash' };
            await projector.observe({ ...base, input: { command }, type: 'tool-call' });
            await projector.observe({ ...base, output, type: 'tool-result' });
        };
        const forecast = 'Saturday: rain likely, high 58F. Sunday: clearer, high 66F.';
        await run('c1', "curl -fsS 'https://api.open-meteo.com/v1/forecast?lat=41.8'", {
            exit_code: 0,
            formatted_output: forecast,
        });
        await run('c2', 'haus message check', { exit_code: 0, formatted_output: forecast });
        await run('c3', 'curl https://wttr.in/Chicago', { exit_code: 7, formatted_output: 'x' });
        await run('c4', 'printenv', { exit_code: 0, formatted_output: 'SECRET_KEY=abcdefgh' });
        expect(offered.filter((offer) => offer.action !== null)).toEqual([
            { action: 'curl -fsS api.open-meteo.com/v1/forecast' },
            { action: 'curl -fsS api.open-meteo.com/v1/forecast', result: forecast },
            { action: 'curl wttr.in/Chicago' },
            { action: 'printenv' },
        ]);
    });
});
