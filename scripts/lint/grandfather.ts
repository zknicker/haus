import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Grandfathered } from './grandfathered-overrides.mts';

/**
 * Regenerates `grandfathered.json` from a lint run without the exemptions.
 *
 *   bun scripts/lint/grandfather.ts                  shrink every list
 *   bun scripts/lint/grandfather.ts --adopt <rule>   start a rule's file list
 *   bun scripts/lint/grandfather.ts --ratchet <rule> start a rule's `allow` counts
 *
 * Without a flag, a list only shrinks: a file that is clean now drops out, a
 * new violation stays a lint error, and a count or complexity ceiling only falls.
 */

const root = join(import.meta.dir, '..', '..');
const listPath = join(import.meta.dir, 'grandfathered.json');
const complexityRule = 'complexity';
const complexityMessage = /has a complexity of (\d+)/u;

const flags = readFlags(process.argv.slice(2));
const current: Grandfathered = await Bun.file(listPath).json();
const violations = lintWithoutExemptions();

const next: Grandfathered = {
    allowances: shrinkAllowances(),
    complexity: shrinkComplexity(),
    rules: shrinkRules(),
};
writeFileSync(listPath, `${JSON.stringify(next, null, 4)}\n`);
Bun.spawnSync(['bun', 'x', 'oxfmt', listPath], { cwd: root, stderr: 'inherit' });
report();

function shrinkRules() {
    const rules: Grandfathered['rules'] = {};
    for (const rule of [...new Set([...Object.keys(current.rules), ...flags.adopt])].sort()) {
        const files = [...(violations.counts.get(rule)?.keys() ?? [])].sort();
        const kept = flags.adopt.has(rule)
            ? files
            : files.filter((file) => current.rules[rule]?.includes(file));
        if (kept.length > 0) {
            rules[rule] = kept;
        }
    }
    return rules;
}

function shrinkAllowances() {
    const allowances: Grandfathered['allowances'] = {};
    const ratcheted = [...new Set([...Object.keys(current.allowances), ...flags.ratchet])];
    for (const rule of ratcheted.sort()) {
        const counts = violations.counts.get(rule) ?? new Map<string, number>();
        const kept: Record<string, number> = {};
        for (const [file, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
            const previous = current.allowances[rule]?.[file];
            if (previous !== undefined || flags.ratchet.has(rule)) {
                kept[file] = Math.min(count, previous ?? count);
            }
        }
        if (Object.keys(kept).length > 0) {
            allowances[rule] = kept;
        }
    }
    return allowances;
}

function shrinkComplexity() {
    const complexity: Grandfathered['complexity'] = {};
    const ceilings = [...violations.complexity].sort(([a], [b]) => a.localeCompare(b));
    for (const [file, ceiling] of ceilings) {
        const previous = current.complexity[file];
        if (previous !== undefined || flags.adopt.has(complexityRule)) {
            complexity[file] = Math.min(ceiling, previous ?? ceiling);
        }
    }
    return complexity;
}

function report() {
    for (const [rule, files] of Object.entries(next.rules)) {
        console.log(`${rule}: ${files.length} files (was ${current.rules[rule]?.length ?? 0})`);
    }
    for (const [rule, counts] of Object.entries(next.allowances)) {
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        console.log(`${rule}: ${total} allowed in ${Object.keys(counts).length} files`);
    }
    const before = Object.keys(current.complexity).length;
    console.log(`complexity: ${Object.keys(next.complexity).length} files (was ${before})`);
}

interface Diagnostic {
    code: string;
    filename: string;
    message: string;
}

function lintWithoutExemptions() {
    const run = Bun.spawnSync(['bun', 'x', 'oxlint', '--format', 'json', '.'], {
        cwd: root,
        env: { ...process.env, HAUS_LINT_GRANDFATHER: 'off' },
        stderr: 'inherit',
    });
    const lint: { diagnostics: Diagnostic[] } = JSON.parse(run.stdout.toString());
    const counts = new Map<string, Map<string, number>>();
    const complexity = new Map<string, number>();
    for (const diagnostic of lint.diagnostics) {
        const rule = ruleName(diagnostic.code);
        const file = diagnostic.filename;
        if (rule === complexityRule) {
            const score = Number(complexityMessage.exec(diagnostic.message)?.[1]);
            complexity.set(file, Math.max(score, complexity.get(file) ?? 0));
            continue;
        }
        const files = counts.get(rule) ?? new Map<string, number>();
        files.set(file, (files.get(file) ?? 0) + 1);
        counts.set(rule, files);
    }
    return { complexity, counts };
}

/** `eslint(no-empty)` → `no-empty`; `react-hooks(rules-of-hooks)` → `react/rules-of-hooks`. */
function ruleName(code: string) {
    const match = /^([\w-]+)\((.+)\)$/u.exec(code);
    if (!match) {
        throw new Error(`Unexpected Oxlint rule code: ${code}`);
    }
    const [, plugin, rule] = match;
    if (plugin === 'eslint') {
        return rule;
    }
    return `${plugin === 'react-hooks' ? 'react' : plugin}/${rule}`;
}

function readFlags(args: string[]) {
    const adopt = new Set<string>();
    const ratchet = new Set<string>();
    for (let index = 0; index < args.length; index += 2) {
        const [flag, rule] = [args[index], args[index + 1]];
        if (!rule || (flag !== '--adopt' && flag !== '--ratchet')) {
            throw new Error(
                'Usage: bun scripts/lint/grandfather.ts [--adopt <rule> | --ratchet <rule>]...'
            );
        }
        (flag === '--adopt' ? adopt : ratchet).add(rule);
    }
    return { adopt, ratchet };
}
