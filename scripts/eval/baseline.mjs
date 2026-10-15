// The baseline build: a detached worktree at the baseline commit, carrying
// this checkout's scenarios and grader so both builds run identical tests and
// differ only in the product code under test.

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

/** Harness directories copied from the change checkout into the baseline. */
export const harnessDirectories = ['scripts/agent-tests', 'scripts/eval'];

/**
 * What the baseline needs, as data: where its worktree lives (beside the other
 * Claude worktrees of the main checkout), its stack id, what to copy, and
 * whether it still needs dependencies installed.
 */
export function planBaseline({ changeRoot, evalName, hasNodeModules, mainRoot, sha }) {
    const short = sha.slice(0, 10);
    const root = path.join(mainRoot, '.claude', 'worktrees', `eval-baseline-${short}`);
    return {
        copies: harnessDirectories.map((directory) => ({
            from: path.join(changeRoot, directory),
            to: path.join(root, directory),
        })),
        needsInstall: !hasNodeModules,
        root,
        sha,
        short,
        stackId: `eval-${evalName}-base`,
    };
}

/** Resolves the revision, creates or reuses the worktree, installs, and copies the harness. */
export function prepareBaseline({ changeRoot, evalName, log, revision }) {
    const sha = git(changeRoot, ['rev-parse', '--verify', `${revision}^{commit}`]);
    const commonDir = path.resolve(changeRoot, git(changeRoot, ['rev-parse', '--git-common-dir']));
    const mainRoot = path.dirname(commonDir);
    const probeRoot = planBaseline({
        changeRoot,
        evalName,
        hasNodeModules: true,
        mainRoot,
        sha,
    }).root;
    const plan = planBaseline({
        changeRoot,
        evalName,
        hasNodeModules: existsSync(path.join(probeRoot, 'node_modules')),
        mainRoot,
        sha,
    });
    if (existsSync(plan.root)) {
        const head = git(plan.root, ['rev-parse', 'HEAD']);
        if (head !== sha) {
            throw new Error(
                `${plan.root} exists at ${head.slice(0, 10)}, not ${plan.short}; remove it or pick another revision.`
            );
        }
        log(`reusing worktree ${plan.root}`);
    } else {
        log(`creating worktree ${plan.root}`);
        git(changeRoot, ['worktree', 'add', '--detach', plan.root, sha]);
    }
    if (plan.needsInstall) {
        log('installing dependencies (bun run setup:worktree)');
        const result = spawnSync('bun', ['run', 'setup:worktree'], {
            cwd: plan.root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        if (result.status !== 0) {
            throw new Error(
                `setup:worktree failed in ${plan.root}: ${(result.stderr || result.stdout).trim().slice(-400)}`
            );
        }
    }
    for (const copy of plan.copies) {
        mirrorDirectory(copy.from, copy.to);
    }
    return plan;
}

/**
 * Replaces `to` with an exact copy of `from`. A plain recursive copy only adds
 * and overwrites, so a scenario the change retired would survive from the
 * baseline commit and break the runner, which loads every scenario module.
 */
export function mirrorDirectory(from, to) {
    rmSync(to, { force: true, recursive: true });
    cpSync(from, to, { recursive: true });
}

export function git(cwd, args) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}
