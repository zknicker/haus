// Grades memory-feedback evidence files written by the memory-feedback-*
// scenarios. Deterministic and rerunnable over any saved evidence:
//
//   bun scripts/agent-tests/memory-feedback-grade.mjs [--since <stamp>] [--max-words <n>] [--json]
//
// captured: each feedback reached Standing Preferences (brevity rule rewritten
//           or added; an autonomy rule present). Control expects no change.
// grammar:  every new or changed line is one terse imperative rule: <= 20 words,
//           not two rules joined, no delta words, no sources/dates/handles, no caveats.
// merge:    exactly one brevity rule and at most one net new line.
// applied:  the post-reset probe reply stays under --max-words and ends without
//           an offer or permission question.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { evidenceDirectory, seededRules } from './memory-feedback.mjs';

const brevity = /\b(short|brief|concise|terse|tight|lean|ground|scope|focus|succinct|minimal)/i;
const autonomy =
    /\b(ask(ing)?\b|routine|next step|just do|proceed|permission|confirm|agency|autonom)/i;
const delta = /\b(more|less|a bit|a little|tighter|shorter|briefer|fewer|stop|anymore)\b/i;
const sourced =
    /\bsource\b|\bmsg\b|#[\w-]+|\d{4}-\d{2}-\d{2}|reinforc|@[\w-]+|\bfeedback\b|\bcorrect(ed|ion)\b|\b(said|told|asked) (me|us)\b/i;
const caveat =
    /\b(does not|doesn't) (authorize|apply)|irreversible|destructive|\bsafety\b|still (ask|confirm)/i;
const nonImperative = /^(the |user |they |he |she |owner |human |prefers |wants |likes )/i;
const offer =
    /(want me to|should i|shall i|would you like|do you want|let me know if|happy to|if you want|if you'd like|i can also)/i;

export function standingPreferences(memory) {
    const match = /## Standing Preferences\n([\s\S]*?)(?=\n## |$)/.exec(memory ?? '');
    if (!match) {
        return null;
    }
    return match[1]
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => line.replace(/^\s*[-*]\s+/, '').trim());
}

export function gradeRule(rule) {
    const problems = [];
    const words = rule.split(/\s+/).filter(Boolean).length;
    if (words > 20) {
        problems.push(`${words} words`);
    }
    if (brevity.test(rule) && autonomy.test(rule)) {
        problems.push('compound: two rules in one line');
    }
    for (const [label, pattern] of [
        ['delta', delta],
        ['sourced', sourced],
        ['caveat', caveat],
        ['not imperative', nonImperative],
    ]) {
        const hit = pattern.exec(rule);
        if (hit) {
            problems.push(`${label}: "${hit[0]}"`);
        }
    }
    return problems;
}

export function gradeEvidence(evidence, { maxWords = 150 } = {}) {
    const before = standingPreferences(evidence.memory.seeded) ?? [];
    const after = standingPreferences(evidence.memory.afterFeedback);
    const final = standingPreferences(evidence.memory.afterProbe);
    const changed = (after ?? []).filter((line) => !before.includes(line));
    const isControl = evidence.variant === 'control';
    const brevityLines = (after ?? []).filter((line) => brevity.test(line));
    const captured = isControl
        ? changed.length === 0
        : changed.some((line) => brevity.test(line)) && (after ?? []).some((l) => autonomy.test(l));
    const ruleProblems = changed.map((rule) => ({ problems: gradeRule(rule), rule }));
    const probeText = evidence.replies.probe.join('\n\n');
    const probeWords = probeText.split(/\s+/).filter(Boolean).length;
    const tail = probeText.slice(-240);
    const asks = offer.test(tail) || /\?\s*$/.test(probeText.trim());
    return {
        manualReads: (evidence.manualCommands ?? []).filter((c) => /memory-hygiene/i.test(c))
            .length,
        applied: probeWords <= maxWords && !asks,
        asks,
        captured,
        changed,
        finalDrift: JSON.stringify(final) !== JSON.stringify(after),
        grammar: ruleProblems.every((entry) => entry.problems.length === 0),
        merge: brevityLines.length === 1 && (after?.length ?? 0) <= before.length + 1,
        model: `${evidence.agent.runtimeId}/${evidence.agent.modelId}`,
        preferences: after,
        probeWords,
        ruleProblems,
        canary: (after ?? []).includes(seededRules[1]),
        stamp: evidence.stamp,
        variant: evidence.variant,
    };
}

async function main(argv) {
    const since = option(argv, '--since') ?? '';
    const maxWords = Number(option(argv, '--max-words') ?? 150);
    const files = (await readdir(evidenceDirectory)).filter(
        (file) => file.endsWith('.json') && file >= since
    );
    const grades = [];
    for (const file of files.sort()) {
        const evidence = JSON.parse(await readFile(path.join(evidenceDirectory, file), 'utf8'));
        grades.push(gradeEvidence(evidence, { maxWords }));
    }
    if (argv.includes('--json')) {
        process.stdout.write(`${JSON.stringify(grades, null, 2)}\n`);
        return;
    }
    const mark = (value) => (value ? 'yes' : 'NO');
    process.stdout.write(
        'stamp | variant | captured | grammar | merge | applied | words | asks | hygiene reads\n'
    );
    for (const grade of grades) {
        process.stdout.write(
            `${grade.stamp} | ${grade.variant} | ${mark(grade.captured)} | ${mark(grade.grammar)} | ${mark(grade.merge)} | ${mark(grade.applied)} | ${grade.probeWords} | ${grade.asks} | ${grade.manualReads}\n`
        );
        for (const entry of grade.ruleProblems) {
            const verdict = entry.problems.length > 0 ? entry.problems.join('; ') : 'ok';
            process.stdout.write(`    ${JSON.stringify(entry.rule)} -> ${verdict}\n`);
        }
    }
    process.stdout.write(
        '\nvariant | n | captured | grammar | merge | applied | median words | hygiene reads\n'
    );
    for (const variant of [...new Set(grades.map((grade) => grade.variant))].sort()) {
        const runs = grades.filter((grade) => grade.variant === variant);
        const count = (key) => `${runs.filter((grade) => grade[key]).length}/${runs.length}`;
        const words = runs.map((grade) => grade.probeWords).sort((a, b) => a - b);
        process.stdout.write(
            `${variant} | ${runs.length} | ${count('captured')} | ${count('grammar')} | ${count('merge')} | ${count('applied')} | ${words[Math.floor(words.length / 2)]} | ${runs.filter((grade) => grade.manualReads > 0).length}/${runs.length}\n`
        );
    }
}

function option(argv, name) {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
}

if (import.meta.main) {
    await main(process.argv.slice(2));
}
