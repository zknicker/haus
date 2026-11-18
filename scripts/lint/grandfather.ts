import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Grandfathered } from './grandfathered-overrides.mts';

/**
 * Regenerates `grandfathered.json` from a lint run without the exemptions.
 *
 *   bun scripts/lint/grandfather.ts                 shrink every list
 *   bun scripts/lint/grandfather.ts --adopt <rule>  start a rule's list
 *
 * Without `--adopt`, a list only loses files: one that is clean now drops out,
 * a new violation stays a lint error, and a complexity ceiling only falls.
 */

const root = join(import.meta.dir, '..', '..');
const listPath = join(import.meta.dir, 'grandfathered.json');
const complexityRule = 'complexity';
const complexityMessage = /has a complexity of (\d+)/u;

const adopted = readAdoptedRules(process.argv.slice(2));
const current: Grandfathered = await Bun.file(listPath).json();
const violations = lintWithoutExemptions();

const next: Grandfathered = { complexity: {}, rules: {} };
for (const rule of [...new Set([...Object.keys(current.rules), ...adopted])].sort()) {
    if (rule === complexityRule) {
        continue;
    }
    const files = [...(violations.files.get(rule) ?? [])].sort();
    const kept = adopted.has(rule)
        ? files
        : files.filter((file) => current.rules[rule]?.includes(file));
    if (kept.length > 0) {
        next.rules[rule] = kept;
    }
}
for (const [file, ceiling] of [...violations.complexity].sort(([a], [b]) => a.localeCompare(b))) {
    const previous = current.complexity[file];
    if (previous !== undefined || adopted.has(complexityRule)) {
        next.complexity[file] = Math.min(ceiling, previous ?? ceiling);
    }
}

writeFileSync(listPath, `${JSON.stringify(next, null, 4)}\n`);
for (const [rule, files] of Object.entries(next.rules)) {
    const before = current.rules[rule]?.length ?? 0;
    console.log(`${rule}: ${files.length} files (was ${before})`);
}
console.log(
    `complexity: ${Object.keys(next.complexity).length} files (was ${Object.keys(current.complexity).length})`
);

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
    const report: { diagnostics: Diagnostic[] } = JSON.parse(run.stdout.toString());
    const files = new Map<string, Set<string>>();
    const complexity = new Map<string, number>();
    for (const diagnostic of report.diagnostics) {
        const rule = ruleName(diagnostic.code);
        if (rule === complexityRule) {
            const score = Number(complexityMessage.exec(diagnostic.message)?.[1]);
            complexity.set(
                diagnostic.filename,
                Math.max(score, complexity.get(diagnostic.filename) ?? 0)
            );
            continue;
        }
        files.set(rule, (files.get(rule) ?? new Set()).add(diagnostic.filename));
    }
    return { complexity, files };
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

function readAdoptedRules(args: string[]) {
    const rules = new Set<string>();
    for (let index = 0; index < args.length; index += 1) {
        if (args[index] !== '--adopt' || !args[index + 1]) {
            throw new Error('Usage: bun scripts/lint/grandfather.ts [--adopt <rule>]...');
        }
        rules.add(args[index + 1]);
        index += 1;
    }
    return rules;
}
