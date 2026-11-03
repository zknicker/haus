import {
    heartbeatLearnedInputSchema,
    heartbeatLearnedResponseSchema,
    heartbeatReportInputSchema,
    heartbeatReportResponseSchema,
} from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';

interface HeartbeatDeps {
    client: AgentApiRequester;
    readStdin(): Promise<string>;
    write(text: string): void;
}

const TEXT_FLAG = { description: 'Unsupported; the text uses stdin', name: '--text' };

const REPORT_RECIPE = `haus heartbeat report <<'HAUSMSG'\nThe Etsy shop has 3 new reviews, one 2-star about shipping. Worth a look today.\nHAUSMSG`;
const LEARNED_RECIPE = `haus heartbeat learned <<'HAUSMSG'\n- I saved Priya's release-note tone correction; I had said "got it" and had not saved it.\nHAUSMSG`;

export const HEARTBEAT_SUBCOMMANDS: SubCommand[] = [
    {
        allowExtraPositionals: true,
        examples: [REPORT_RECIPE],
        flags: [TEXT_FLAG],
        name: 'report',
        notes: [
            'Heartbeat runs only. One report per run; it reaches your main session after this run settles, and your main session decides who hears it.',
        ],
        positionals: [],
        run: (args) => runHeartbeatReport(args, defaultDeps()),
        summary: 'Send this heartbeat run its one report, read only from stdin',
        usage: 'haus heartbeat report',
    },
    {
        allowExtraPositionals: true,
        examples: [LEARNED_RECIPE],
        flags: [TEXT_FLAG],
        name: 'learned',
        notes: [
            'Nightly heartbeat only. A few bullet lines in your own voice; it is stored on the run.',
        ],
        positionals: [],
        run: (args) => runHeartbeatLearned(args, defaultDeps()),
        summary: 'Record what you learned today, read only from stdin (nightly heartbeat)',
        usage: 'haus heartbeat learned',
    },
];

export async function runHeartbeatReport(args: ParsedArgs, deps: HeartbeatDeps): Promise<number> {
    const input = heartbeatReportInputSchema.safeParse({
        text: await textOf(args, deps, REPORT_RECIPE),
    });
    if (!input.success) {
        throw new AgentCliError('INVALID_ARG', 'The report must be 1–4000 characters.');
    }
    await deps.client.request('/api/agent/heartbeat/report', heartbeatReportResponseSchema, {
        body: input.data,
        method: 'POST',
    });
    deps.write('Report queued for your main session.\n');
    return 0;
}

export async function runHeartbeatLearned(args: ParsedArgs, deps: HeartbeatDeps): Promise<number> {
    const input = heartbeatLearnedInputSchema.safeParse({
        text: await textOf(args, deps, LEARNED_RECIPE),
    });
    if (!input.success) {
        throw new AgentCliError('INVALID_ARG', 'The summary must be 1–2000 characters.');
    }
    await deps.client.request('/api/agent/heartbeat/learned', heartbeatLearnedResponseSchema, {
        body: input.data,
        method: 'POST',
    });
    deps.write("Summary saved on tonight's run.\n");
    return 0;
}

async function textOf(args: ParsedArgs, deps: HeartbeatDeps, recipe: string): Promise<string> {
    if (args.flags['--text'] || args.values['--text'] !== undefined) {
        throw bodyError('TEXT_FLAG_UNSUPPORTED', '--text is not supported.', recipe);
    }
    if (args.positionals.length > 0) {
        throw bodyError(
            'POSITIONAL_CONTENT_UNSUPPORTED',
            'Positional text is not supported.',
            recipe
        );
    }
    const text = (await deps.readStdin()).trim();
    if (!text) {
        throw bodyError('MISSING_CONTENT', 'Text is required on stdin.', recipe);
    }
    return text;
}

function bodyError(code: string, message: string, recipe: string): AgentCliError {
    return new AgentCliError(code, message, { nextAction: recipe });
}

function defaultDeps(): HeartbeatDeps {
    return {
        client: createAgentApiClient(),
        readStdin: async () => (process.stdin.isTTY ? '' : await readAgentStdin()),
        write: (text) => process.stdout.write(text),
    };
}
