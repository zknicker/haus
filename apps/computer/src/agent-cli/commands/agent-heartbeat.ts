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

const TEXT_FLAG = {
    description: 'The text. Omit it to pipe the text on stdin.',
    name: '--text',
    valueName: '<text>',
};

export const HEARTBEAT_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus heartbeat report --text "The Etsy shop has 3 new reviews, one 2-star about shipping. Worth a look today."',
        ],
        flags: [TEXT_FLAG],
        name: 'report',
        notes: [
            'Heartbeat runs only. One report per run; it reaches your main session after this run settles, and your main session decides who hears it.',
        ],
        positionals: [],
        run: (args) => runHeartbeatReport(args, defaultDeps()),
        summary: 'Send this heartbeat run its one report to your main session',
        usage: 'haus heartbeat report [--text <text>]',
    },
    {
        examples: [
            'haus heartbeat learned --text "Priya corrected my release-note tone; I had said I would save it and had not."',
        ],
        flags: [TEXT_FLAG],
        name: 'learned',
        notes: ['Nightly heartbeat only. A few lines in your own voice; it is stored on the run.'],
        positionals: [],
        run: (args) => runHeartbeatLearned(args, defaultDeps()),
        summary: 'Record what you learned today (nightly heartbeat)',
        usage: 'haus heartbeat learned [--text <text>]',
    },
];

export async function runHeartbeatReport(args: ParsedArgs, deps: HeartbeatDeps): Promise<number> {
    const input = heartbeatReportInputSchema.safeParse({ text: await textOf(args, deps) });
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
    const input = heartbeatLearnedInputSchema.safeParse({ text: await textOf(args, deps) });
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

async function textOf(args: ParsedArgs, deps: HeartbeatDeps): Promise<string> {
    const flag = args.values['--text'];
    const text = (flag ?? (await deps.readStdin())).trim();
    if (!text) {
        throw new AgentCliError('MISSING_CONTENT', '--text is required.', {
            nextAction: 'Pass --text "<text>" or pipe the text on stdin.',
        });
    }
    return text;
}

function defaultDeps(): HeartbeatDeps {
    return {
        client: createAgentApiClient(),
        readStdin: async () => (process.stdin.isTTY ? '' : await readAgentStdin()),
        write: (text) => process.stdout.write(text),
    };
}
