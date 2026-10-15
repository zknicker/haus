import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { harnessDirectories, mirrorDirectory, planBaseline } from './baseline.mjs';

const sha = '0123456789abcdef0123456789abcdef01234567';

test("plans the baseline worktree beside the main checkout with this checkout's harness", () => {
    const plan = planBaseline({
        changeRoot: '/repo/.claude/worktrees/feature',
        evalName: 'placement',
        hasNodeModules: false,
        mainRoot: '/repo',
        sha,
    });
    expect(plan).toEqual({
        copies: [
            {
                from: '/repo/.claude/worktrees/feature/scripts/agent-tests',
                to: '/repo/.claude/worktrees/eval-baseline-0123456789/scripts/agent-tests',
            },
            {
                from: '/repo/.claude/worktrees/feature/scripts/eval',
                to: '/repo/.claude/worktrees/eval-baseline-0123456789/scripts/eval',
            },
        ],
        needsInstall: true,
        root: '/repo/.claude/worktrees/eval-baseline-0123456789',
        sha,
        short: '0123456789',
        stackId: 'eval-placement-base',
    });
});

test('a baseline that already has dependencies skips the install', () => {
    const plan = planBaseline({
        changeRoot: '/a',
        evalName: 'attention',
        hasNodeModules: true,
        mainRoot: '/m',
        sha,
    });
    expect(plan.needsInstall).toBe(false);
    expect(plan.stackId).toBe('eval-attention-base');
});

test('copies exactly the scenarios and the grader', () => {
    expect(harnessDirectories).toEqual(['scripts/agent-tests', 'scripts/eval']);
});

test('mirroring drops baseline scenarios the change retired', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'eval-mirror-'));
    const from = path.join(root, 'change');
    const to = path.join(root, 'baseline');
    mkdirSync(path.join(from, 'scenarios'), { recursive: true });
    mkdirSync(path.join(to, 'scenarios'), { recursive: true });
    writeFileSync(path.join(from, 'scenarios', 'kept.mjs'), 'new');
    writeFileSync(path.join(to, 'scenarios', 'kept.mjs'), 'old');
    writeFileSync(path.join(to, 'scenarios', 'retired.mjs'), 'old');

    mirrorDirectory(from, to);

    expect(readdirSync(path.join(to, 'scenarios'))).toEqual(['kept.mjs']);
    expect(readFileSync(path.join(to, 'scenarios', 'kept.mjs'), 'utf8')).toBe('new');
});
