// Thought housekeeping eval (ADR 0036). Sends every labeled case in
// apps/server/src/server-agents/evals/thought-housekeeping-cases.json through the
// production Gemini thought summarizer and reports SKIP precision and recall, the
// phrase shown for each case, and the local fallback filter on the same set.
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

interface EvalCase {
    expected: 'show' | 'skip';
    id: string;
    kind: 'reasoning' | 'title';
    text: string;
}
interface Outcome {
    answer: string;
    expected: EvalCase['expected'];
    fallbackSkip: boolean;
    id: string;
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
        console.log(
            `${correct ? 'ok  ' : 'MISS'} ${outcome.id.padEnd(24)} expected=${outcome.expected.padEnd(4)} → ${outcome.answer}`
        );
    }
    const failed = results.filter((outcome) => outcome.answer === '(failed)').length;
    const answered = results.filter((outcome) => outcome.answer !== '(failed)');
    console.log(`\nGemini (${answered.length} answered, ${failed} failed):`);
    printScores(answered.map((outcome) => [outcome.answer === 'SKIP', outcome.expected]));
    console.log('\nLocal fallback filter:');
    printScores(results.map((outcome) => [outcome.fallbackSkip, outcome.expected]));
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
