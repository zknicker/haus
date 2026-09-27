// Thought housekeeping eval (ADR 0036). Sends every labeled case in
// apps/server/src/server-agents/evals/thought-housekeeping-cases.json through the
// production Gemini thought summarizer and reports SKIP precision and recall, the
// phrase shown for each case, wording checks on every shown phrase (filler "now",
// length, per-case banned and required words, the share opening with "I"), and
// the local fallback filter on the same set.
//
// This is a dev tool, not CI: each case is a real Gemini call.
// Usage: agent-varlock -- ./node_modules/.bin/varlock run -- bun scripts/thought-housekeeping-eval.ts [--only <id>] [--runs <n>]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    createGeminiThoughtSummarizer,
    thoughtSummaryPromptVersion,
} from '../apps/server/src/server-agents/agent-thought-summarizer.ts';
import { isHousekeepingThought } from '../apps/server/src/server-agents/thought-housekeeping.ts';
import { condenseThoughtLocally } from '../packages/haus-api/src/agent-thought-phrase.ts';
import {
    checkThoughtPhrase,
    opensWithI,
    type ThoughtEvalRules,
    thoughtEvalMaxIOpeningShare,
} from './thought-eval-checks.ts';

interface EvalCase {
    expected: 'show' | 'skip';
    id: string;
    kind: 'reasoning' | 'title';
    rules?: ThoughtEvalRules;
    text: string;
}
interface Outcome {
    answer: string;
    expected: EvalCase['expected'];
    fallbackSkip: boolean;
    id: string;
    problems: string[];
    run: number;
}

const corpusPath = 'apps/server/src/server-agents/evals/thought-housekeeping-cases.json';
const apiKey = process.env.HAUS_GEMINI_API_KEY;
if (!apiKey) {
    throw new Error('HAUS_GEMINI_API_KEY is not set; run through varlock.');
}
const summarizer = createGeminiThoughtSummarizer({ apiKey, timeoutMs: 15_000 });
const corpus = JSON.parse(await readFile(corpusPath, 'utf8')) as { cases: EvalCase[] };
const flag = (name: string) =>
    process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const only = flag('--only');
const runs = Number(flag('--runs') ?? 1);
const cases = corpus.cases.filter((item) => !only || item.id === only);
const outcomes: Outcome[] = [];
for (let run = 1; run <= runs; run += 1) {
    for (let index = 0; index < cases.length; index += 4) {
        const batch = cases.slice(index, index + 4);
        outcomes.push(...(await Promise.all(batch.map((item) => judgeCase(item, run)))));
    }
}
report(outcomes);
const directory = path.join('.context/thought-housekeeping-eval');
await mkdir(directory, { recursive: true });
const file = path.join(directory, `${thoughtSummaryPromptVersion}-${Date.now()}.json`);
await writeFile(
    file,
    `${JSON.stringify({ outcomes, promptVersion: thoughtSummaryPromptVersion }, null, 4)}\n`
);
console.log(`\nraw outcomes: ${file}`);

async function judgeCase(item: EvalCase, run: number): Promise<Outcome> {
    const summary = await summarizer.summarize(
        item.kind === 'title'
            ? { kind: 'title', title: item.text }
            : { kind: 'reasoning', reasoning: item.text }
    );
    return {
        answer: summary === null ? '(failed)' : summary.kind === 'skip' ? 'SKIP' : summary.text,
        expected: item.expected,
        problems: summary?.kind === 'phrase' ? checkThoughtPhrase(summary.text, item.rules) : [],
        fallbackSkip:
            isHousekeepingThought(item.text) ||
            (item.kind === 'reasoning' && condenseThoughtLocally(item.text) === null),
        id: item.id,
        run,
    };
}

function report(results: Outcome[]) {
    for (const outcome of results) {
        const skipped = outcome.answer === 'SKIP';
        const correct = skipped === (outcome.expected === 'skip');
        const verdict = correct ? (outcome.problems.length > 0 ? 'WORD' : 'ok  ') : 'MISS';
        const problems = outcome.problems.length > 0 ? `  [${outcome.problems.join('; ')}]` : '';
        console.log(
            `${verdict} ${outcome.id.padEnd(26)} expected=${outcome.expected.padEnd(4)} → ${outcome.answer}${problems}`
        );
    }
    const failed = results.filter((outcome) => outcome.answer === '(failed)').length;
    const answered = results.filter((outcome) => outcome.answer !== '(failed)');
    console.log(`\nGemini (${answered.length} answered, ${failed} failed):`);
    printScores(answered.map((outcome) => [outcome.answer === 'SKIP', outcome.expected]));
    printWording(answered.filter((outcome) => outcome.answer !== 'SKIP'));
    console.log('\nLocal fallback filter:');
    printScores(results.map((outcome) => [outcome.fallbackSkip, outcome.expected]));
}

function printWording(shown: Outcome[]) {
    const count = (predicate: (outcome: Outcome) => boolean) => shown.filter(predicate).length;
    const iOpenings = count((outcome) => opensWithI(outcome.answer));
    const share = iOpenings / Math.max(shown.length, 1);
    const verdict = (passed: boolean) => (passed ? 'pass' : 'FAIL');
    const filler = count((outcome) => outcome.problems.includes('filler "now"'));
    const long = count((outcome) => outcome.problems.some((problem) => problem.endsWith(' words')));
    const ruled = count((outcome) =>
        outcome.problems.some(
            (problem) => problem.startsWith('banned') || problem.startsWith('mentions')
        )
    );
    console.log(`  shown phrases ${shown.length}`);
    console.log(
        `  ${verdict(share <= thoughtEvalMaxIOpeningShare)} open with "I": ${(share * 100).toFixed(1)}% (${iOpenings}/${shown.length}, max ${(thoughtEvalMaxIOpeningShare * 100).toFixed(0)}%)`
    );
    console.log(`  ${verdict(filler === 0)} filler "right now"/trailing "now": ${filler}`);
    console.log(`  ${verdict(long === 0)} over eight words: ${long}`);
    console.log(`  ${verdict(ruled === 0)} per-case banned/required word misses: ${ruled}`);
}

function printScores(pairs: [boolean, EvalCase['expected']][]) {
    const truePositive = pairs.filter(([skip, expected]) => skip && expected === 'skip').length;
    const falsePositive = pairs.filter(([skip, expected]) => skip && expected === 'show').length;
    const falseNegative = pairs.filter(([skip, expected]) => !skip && expected === 'skip').length;
    const precision = truePositive / Math.max(truePositive + falsePositive, 1);
    const recall = truePositive / Math.max(truePositive + falseNegative, 1);
    console.log(
        `  skip precision ${(precision * 100).toFixed(1)}% (${truePositive}/${truePositive + falsePositive}), recall ${(recall * 100).toFixed(1)}% (${truePositive}/${truePositive + falseNegative})`
    );
}
