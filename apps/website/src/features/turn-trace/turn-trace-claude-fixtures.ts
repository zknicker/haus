/** Claude Code turns from the 2026-10-06 Activity review (see `turn-trace-test-fixtures.ts`). */
import { call, host, journal, t, think } from './turn-trace-test-fixtures.ts';

const glob =
    '<tool_use_error>Error: No such tool available: Glob. Glob is not available in this session — find files with `find` via the Bash tool instead.</tool_use_error>';

function subagent(label: string, [start, end]: [string, string], usage: [number, number]) {
    return {
        endedAt: t(end),
        label,
        startedAt: t(start),
        status: 'completed' as const,
        subagentType: 'general-purpose',
        usage: { durationMs: usage[0], toolUses: usage[1], totalTokens: 26_000 },
    };
}

/** Tiny / claude-code: three parallel sub-agents, then reads, edits, a test run, a reply. */
export const complexTurn = journal(
    'run_BbBBDRC8yQF1mZpg',
    ['40:26.192', '41:50.838'],
    [
        call('claim', 'bash', ['40:28.605', '40:29.149'], {
            command:
                'haus task claim --target dm:@zach-knickerbocker --message-id hVrzqTGM 2>&1 | head -3',
        }),
        call(
            'sec',
            'Agent',
            ['40:30.275', '40:49.395'],
            { description: 'Security review' },
            {
                output: 'No critical issues.\n\n**Findings**\n- `LinkStore` grows without bound.',
                subagent: subagent('Security review', ['40:30.282', '40:49.393'], [19_118, 6]),
            }
        ),
        call(
            'cov',
            'Agent',
            ['40:31.517', '40:47.338'],
            { description: 'Test coverage audit' },
            {
                subagent: subagent('Test coverage audit', ['40:31.520', '40:47.336'], [15_818, 3]),
            }
        ),
        call(
            'sec-glob',
            'Glob',
            ['40:32.299', '40:32.299'],
            { path: `${host}/projects/tinylink`, pattern: 'src/**/*' },
            {
                error: glob,
                parentToolCallId: 'sec',
                status: 'failed',
            }
        ),
        call(
            'docs',
            'Agent',
            ['40:33.071', '40:40.016'],
            { description: 'API docs check' },
            {
                subagent: subagent('API docs check', ['40:33.073', '40:40.014'], [6944, 4]),
            }
        ),
        call(
            'cov-glob',
            'Glob',
            ['40:33.389', '40:33.389'],
            { path: `${host}/projects/tinylink`, pattern: '**/*.ts' },
            {
                error: glob,
                parentToolCallId: 'cov',
                status: 'failed',
            }
        ),
        call(
            'sec-grep',
            'Grep',
            ['40:33.619', '40:33.619'],
            { path: `${host}/projects/tinylink/src`, pattern: 'eval|innerHTML' },
            {
                error: glob.replaceAll('Glob', 'Grep'),
                parentToolCallId: 'sec',
                status: 'failed',
            }
        ),
        call(
            'docs-readme',
            'Read',
            ['40:34.632', '40:34.638'],
            { file_path: `${host}/projects/tinylink/README.md` },
            { parentToolCallId: 'docs' }
        ),
        call(
            'docs-index',
            'Read',
            ['40:35.337', '40:35.342'],
            { file_path: `${host}/projects/tinylink/src/index.ts` },
            { parentToolCallId: 'docs' }
        ),
        call(
            'sec-find',
            'Bash',
            ['40:35.376', '40:35.409'],
            { command: `cd ${host}/projects/tinylink && find src -type f` },
            { parentToolCallId: 'sec' }
        ),
        call('read-1', 'read', ['40:52.575', '40:52.583'], {
            file_path: 'projects/tinylink/src/shorten.ts',
        }),
        call('read-2', 'read', ['40:52.580', '40:52.586'], {
            file_path: 'projects/tinylink/src/validate.ts',
        }),
        call('edit-1', 'edit', ['40:55.324', '40:55.331'], {
            file_path: 'projects/tinylink/src/validate.ts',
            new_string: 'b',
            old_string: 'a',
        }),
        call('test', 'bash', ['41:00.363', '41:01.191'], {
            command:
                'cd projects/tinylink && npm test 2>&1 | grep -E "^(✔|✖)"; echo ---; npx --no-install tsc --noEmit -p . 2>&1 | head -5; echo "tsc exit"',
        }),
        call('reply', 'bash', ['41:45.193', '41:46.236'], {
            command:
                "haus message send --target dm:@zach-knickerbocker --reply-to hVrzqTGM --done <<'HAUSMSG'\nReview pass on tinylink is done.\nHAUSMSG",
        }),
    ],
    {
        reasoning: [
            think(
                'think-1',
                '40:50.400',
                '40:52.500',
                'I need to check the actual files, then fix the issues.'
            ),
        ],
    }
);

/** Tiny / claude-code: one script that claims, writes seven files, and runs the tests. */
export const setupCommand = [
    'haus task claim --target dm:@zach-knickerbocker --message-id 5QKFt9Q4 2>&1 | tail -3',
    'mkdir -p projects/tinylink/src projects/tinylink/test && cd projects/tinylink',
    ...[
        'package.json',
        'tsconfig.json',
        'src/validate.ts',
        'src/shorten.ts',
        'src/index.ts',
        'test/shorten.test.ts',
        'README.md',
    ].flatMap((file) => [
        `cat > ${file} <<'EOF'`,
        '{',
        '  "x": 1; haus task claim && echo nope',
        '}',
        'EOF',
    ]),
    'npm test 2>&1 | tail -15; cat src/*.ts test/*.ts README.md package.json tsconfig.json | wc -l',
].join('\n');
