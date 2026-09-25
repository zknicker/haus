// Mention-scope eval (ADR 0030). Sends every labeled case in
// apps/server/src/message-routing/evals/mention-scope-cases.json to Jev with the
// production mention-scope question and reports per-case answers, the confusion
// matrix at the routing threshold, and accuracy/coverage across thresholds.
//
// This is a dev tool, not CI: each case is a real TypeSafe call.
// Usage: agent-varlock -- bunx varlock run -- bun scripts/mention-scope-eval.ts [--only <id>]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RoutingState } from '../apps/server/src/message-routing/jev.ts';
import { routingThreshold } from '../apps/server/src/message-routing/jev.ts';
import {
    mentionScopePromptVersion,
    mentionScopeRequest,
} from '../apps/server/src/message-routing/mention-scope.ts';
import { formatAgentReferenceTarget } from '../packages/haus-api/src/rich-references.ts';

interface EvalCase {
    expected: 'mentioned' | 'others';
    history?: { authorId: string; text: string; secondsBeforeCurrent: number }[];
    id: string;
    text: string;
}
interface Corpus {
    cases: EvalCase[];
    channel: {
        authorId: string;
        agents: { id: string; name: string; description: string }[];
        humans: { id: string; name: string }[];
    };
}
interface Outcome {
    choice: string | null;
    confidence: number | null;
    elapsedMs: number;
    error?: string;
    expected: EvalCase['expected'];
    id: string;
    probability: number | null;
}

const corpusPath = 'apps/server/src/message-routing/evals/mention-scope-cases.json';
const thresholds = [0.8, 0.85, 0.9, 0.95];

const apiKey = process.env.HAUS_TYPESAFE_API_KEY;
if (!apiKey) {
    throw new Error('HAUS_TYPESAFE_API_KEY is not set; run through varlock.');
}
const corpus = JSON.parse(await readFile(corpusPath, 'utf8')) as Corpus;
const only = process.argv.includes('--only')
    ? process.argv[process.argv.indexOf('--only') + 1]
    : undefined;
const cases = corpus.cases.filter((item) => !only || item.id === only);
const outcomes: Outcome[] = [];
for (let index = 0; index < cases.length; index += 4) {
    outcomes.push(...(await Promise.all(cases.slice(index, index + 4).map(judgeCase))));
}
report(outcomes);
const directory = path.join('.context/mention-scope-eval');
await mkdir(directory, { recursive: true });
const file = path.join(directory, `${mentionScopePromptVersion}-${Date.now()}.json`);
await writeFile(
    file,
    `${JSON.stringify({ promptVersion: mentionScopePromptVersion, outcomes }, null, 4)}\n`
);
console.log(`\nraw outcomes: ${file}`);

async function judgeCase(item: EvalCase): Promise<Outcome> {
    const state = caseState(item);
    const started = performance.now();
    for (let attempt = 0; ; attempt += 1) {
        try {
            const response = await fetch('https://api.typesafe.ai/v1/systemone', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(mentionScopeRequest(state)),
                signal: AbortSignal.timeout(15_000),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const body = (await response.json()) as {
                answers?: {
                    scope?: {
                        choice: string;
                        confidence: number;
                        probabilities: Record<string, number>;
                    };
                };
            };
            const scope = body.answers?.scope;
            if (!scope) {
                throw new Error('missing scope answer');
            }
            return {
                id: item.id,
                expected: item.expected,
                choice: scope.choice,
                confidence: scope.confidence,
                probability: scope.probabilities[scope.choice] ?? null,
                elapsedMs: Math.round(performance.now() - started),
            };
        } catch (error) {
            if (attempt >= 1) {
                return {
                    id: item.id,
                    expected: item.expected,
                    choice: null,
                    confidence: null,
                    probability: null,
                    elapsedMs: Math.round(performance.now() - started),
                    error: String(error),
                };
            }
        }
    }
}

function caseState(item: EvalCase): RoutingState {
    const { agents, humans, authorId } = corpus.channel;
    const linked = (text: string) => {
        let result = text;
        for (const agent of agents) {
            result = result.replaceAll(
                new RegExp(`@${agent.name}\\b`, 'gu'),
                `[@${agent.name}](${formatAgentReferenceTarget(agent.id)})`
            );
        }
        return result;
    };
    const mentioned = (text: string) =>
        agents.filter((agent) => new RegExp(`@${agent.name}\\b`, 'u').test(text)).map((a) => a.id);
    return {
        channel: {
            id: 'cht_eval',
            name: null,
            participants: [
                ...agents.map((agent) => ({ ...agent, kind: 'agent' as const })),
                ...humans.map((human) => ({ ...human, kind: 'human' as const })),
            ],
        },
        eligibleAgentIds: agents.map((agent) => agent.id),
        history: (item.history ?? []).map((row, index) => ({
            id: `msg_${index}`,
            authorId: row.authorId,
            text: linked(row.text),
            secondsBeforeCurrent: row.secondsBeforeCurrent,
            explicitAgentIds: mentioned(row.text),
        })),
        currentMessage: {
            authorId,
            text: linked(item.text),
            explicitAgentIds: mentioned(item.text),
            replyRecipientAgentIds: [],
        },
    };
}

function narrows(outcome: Outcome, threshold: number) {
    return (
        outcome.choice === 'mentioned' &&
        (outcome.confidence ?? 0) >= threshold &&
        (outcome.probability ?? 0) >= threshold
    );
}

function report(results: Outcome[]) {
    console.log(`prompt ${mentionScopePromptVersion}, ${results.length} cases\n`);
    for (const row of results) {
        const flag = narrows(row, routingThreshold)
            ? row.expected === 'others'
                ? 'WRONGLY EXCLUSIVE'
                : 'narrow ok'
            : row.expected === 'mentioned'
              ? 'missed narrow'
              : 'ordinary ok';
        console.log(
            [
                row.id.padEnd(34),
                row.expected.padEnd(9),
                (row.choice ?? `ERROR ${row.error}`).padEnd(9),
                `c=${row.confidence?.toFixed(3) ?? '-'}`,
                `p=${row.probability?.toFixed(3) ?? '-'}`,
                `${row.elapsedMs}ms`,
                flag,
            ].join('  ')
        );
    }
    console.log('\nthreshold  narrowed  wrongly-exclusive  missed-narrow  accuracy  coverage');
    for (const threshold of thresholds) {
        const narrowed = results.filter((row) => narrows(row, threshold));
        const wrong = narrowed.filter((row) => row.expected === 'others').length;
        const eligible = results.filter((row) => row.expected === 'mentioned').length;
        const missed = eligible - (narrowed.length - wrong);
        const correct = results.length - wrong - missed;
        console.log(
            [
                threshold.toFixed(2).padEnd(10),
                String(narrowed.length).padEnd(9),
                String(wrong).padEnd(18),
                String(missed).padEnd(14),
                `${((correct / results.length) * 100).toFixed(1)}%`.padEnd(9),
                `${(((narrowed.length - wrong) / eligible) * 100).toFixed(1)}%`,
            ].join(' ')
        );
    }
    const latencies = results.map((row) => row.elapsedMs).sort((a, b) => a - b);
    console.log(
        `\nlatency p50 ${latencies[Math.floor(latencies.length / 2)]}ms, p90 ${latencies[Math.floor(latencies.length * 0.9)]}ms`
    );
}
