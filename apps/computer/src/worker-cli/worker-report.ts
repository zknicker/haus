import {
    workerReportInputSchema,
    workerReportOutcomes,
    workerReportReceiptSchema,
} from '@haus/api';
import type { AgentApiRequester } from '../agent-cli/agent-api-client.ts';
import { AgentCliError } from '../agent-cli/agent-error.ts';
import type { ParsedArgs } from '../agent-cli/parse.ts';
import type { SubCommand } from '../agent-cli/subcommand.ts';
import { writeDurableJson } from '../workers/durable-json.ts';

export interface WorkerCliDeps {
    client: AgentApiRequester;
    readStdin(): Promise<string>;
    reportFile: string | null;
    stdinIsTty: boolean;
    write(output: string | Uint8Array): void;
}

const RECIPE = `haus worker report --outcome done --pr https://github.com/acme/app/pull/7 <<'HAUSMSG'
Fixed the race in the delivery test. The write-up is in [the report](drive://agents/forge/reports/SEC-12/race.md).
HAUSMSG`;

export function reportCommand(deps: () => WorkerCliDeps) {
    return {
        examples: [RECIPE],
        flags: [
            {
                description: 'done, needs-you, or failed',
                name: '--outcome',
                valueName: `<${workerReportOutcomes.join('|')}>`,
            },
            {
                description: 'What you need, for a needs-you report',
                name: '--ask',
                valueName: '<text>',
            },
            {
                description: 'The person the ask is for, as their handle',
                name: '--person',
                valueName: '<handle>',
            },
            {
                description: 'A pull request this turn opened or updated',
                name: '--pr',
                valueName: '<url>',
            },
        ],
        name: 'report',
        notes: [
            "Your report posts in the Task when this turn ends. Running it again replaces this turn's report.",
        ],
        positionals: [],
        run: (args) => runWorkerReport(args, deps()),
        summary: "Record this turn's report with its text on stdin",
        usage: 'haus worker report --outcome <done|needs-you|failed> [--ask <text>] [--person <handle>] [--pr <url>]...',
    } satisfies SubCommand;
}

export async function runWorkerReport(args: ParsedArgs, deps: WorkerCliDeps) {
    const text = deps.stdinIsTty ? '' : (await deps.readStdin()).trim();
    const input = workerReportInputSchema.safeParse({
        ask: args.values['--ask'] ?? null,
        outcome: args.values['--outcome'],
        person: args.values['--person'] ?? null,
        pullRequestUrls: args.valueLists?.['--pr'] ?? [],
        text,
    });
    if (!input.success) {
        throw new AgentCliError('INVALID_ARG', invalidReason(args, text), { nextAction: RECIPE });
    }
    const receipt = await deps.client.request('/api/worker/report', workerReportReceiptSchema, {
        body: input.data,
        method: 'POST',
        timeoutMs: 60_000,
    });
    if (deps.reportFile) {
        await writeDurableJson(deps.reportFile, receipt);
    }
    deps.write(
        [
            `Recorded your ${receipt.draft.outcome} report for this turn.`,
            'It posts in the Task when the turn ends. Run haus worker report again to replace it.',
            '',
        ].join('\n')
    );
    return 0;
}

function invalidReason(args: ParsedArgs, text: string) {
    const outcome = args.values['--outcome'];
    if (!(outcome && (workerReportOutcomes as readonly string[]).includes(outcome))) {
        return 'Name the outcome with --outcome done, needs-you, or failed.';
    }
    if (!text) {
        return 'The report text is required on stdin.';
    }
    if ((outcome === 'needs-you') !== Boolean(args.values['--ask'])) {
        return 'A needs-you report carries --ask, and only it does.';
    }
    return 'The report is too long or names an invalid pull request URL. Keep the text under 8,000 characters.';
}
