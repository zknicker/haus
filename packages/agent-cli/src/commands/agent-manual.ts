import { agentManualGetResponseSchema, agentManualSearchResponseSchema } from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';

interface ManualDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

// Intent is the work; reason is why the Manual is needed for it right now.
const INTENT_FLAG = {
    description: 'What you are trying to accomplish (12–500 characters)',
    name: '--intent',
    valueName: '<text>',
};
const REASON_FLAG = {
    description: 'Why you need the Manual for it now (12–500 characters)',
    name: '--reason',
    valueName: '<text>',
};

/** Example flows shown in `haus manual --help`. */
export const MANUAL_EXAMPLE_FLOWS = [
    'Learn a command family (the noun resolves singular or plural):',
    '  haus manual get reminder --intent "Follow up on the deploy tomorrow morning" --reason "I have not scheduled a reminder before"',
    'Find a procedure, then open the top result:',
    '  haus manual search "claim task" --intent "Pick up the bug report in #product" --reason "Another Agent may already be on it"',
    '  haus manual get recipes/technique/task-claim-lock --intent "Pick up the bug report in #product" --reason "Need the claim procedure before starting"',
    'Lost? Browse every topic:',
    '  haus manual get index --intent "Find the Haus workflow I need" --reason "No topic name comes to mind"',
];

export const MANUAL_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus manual get message --intent "Reply to a question in #product" --reason "I need the send flags and targets"',
        ],
        notes: [
            'Accepts a stable id, a command family noun, or a known alias. A miss lists the closest topics.',
        ],
        flags: [INTENT_FLAG, REASON_FLAG],
        name: 'get',
        positionals: ['<topic>'],
        run: (args) => runManualGet(args, defaultDeps()),
        summary: 'Read one complete Manual topic',
        usage: 'haus manual get <topic> --intent <text> --reason <text>',
    },
    {
        examples: [
            'haus manual search "claim task" --intent "Pick up the bug report in #product" --reason "Another Agent may already be on it"',
        ],
        notes: [
            'Results are ranked; not every keyword must match. No match lists the nearest topics.',
        ],
        flags: [
            INTENT_FLAG,
            REASON_FLAG,
            {
                description: 'Restrict results to recipe topics',
                name: '--scope',
                valueName: '<scope>',
            },
            { description: 'Maximum number of results (1–20)', name: '--limit', valueName: '<n>' },
        ],
        allowExtraPositionals: true,
        name: 'search',
        positionals: ['<keywords>'],
        run: (args) => runManualSearch(args, defaultDeps()),
        summary: 'Find Manual topics by keywords',
        usage: 'haus manual search <keywords> --intent <text> --reason <text> [--scope recipes]',
    },
];

export async function runManualGet(args: ParsedArgs, deps: ManualDeps): Promise<number> {
    const topic = args.positionals[0]?.trim();
    if (!topic) {
        throw new AgentCliError('INVALID_ARG', '<topic> is required.');
    }
    const response = await deps.client.request(
        '/api/agent/manual/get',
        agentManualGetResponseSchema,
        {
            query: {
                intent: requiredManualText(args, '--intent'),
                reason: requiredManualText(args, '--reason'),
                topic,
            },
        }
    );
    deps.write(`# ${response.topic.title}\n\n${response.topic.body.trimEnd()}\n`);
    return 0;
}

export async function runManualSearch(args: ParsedArgs, deps: ManualDeps): Promise<number> {
    const query = args.positionals.join(' ').trim();
    if (!query) {
        throw new AgentCliError('INVALID_ARG', '<keywords> is required.');
    }
    const scope = args.values['--scope'];
    if (scope !== undefined && scope !== 'recipes') {
        throw new AgentCliError('INVALID_ARG', '--scope must be recipes.');
    }
    const response = await deps.client.request(
        '/api/agent/manual/search',
        agentManualSearchResponseSchema,
        {
            query: {
                intent: requiredManualText(args, '--intent'),
                limit: args.values['--limit'],
                q: query,
                reason: requiredManualText(args, '--reason'),
                scope,
            },
        }
    );
    const top = response.results[0];
    if (!top) {
        deps.write(`No Manual topics matched "${response.query}".\n`);
        return 0;
    }
    const lines = response.results.map(
        (result) => `${result.id} — ${result.title}\n  ${result.summary}`
    );
    lines.push('', `Next: open the top result with ${manualGetCommand(top.id, args)}`);
    deps.write(`${lines.join('\n')}\n`);
    return 0;
}

/** The get command for a topic, reusing this lookup's own intent and reason. */
function manualGetCommand(topicId: string, args: ParsedArgs): string {
    const intent = shellQuote(requiredManualText(args, '--intent'));
    const reason = shellQuote(requiredManualText(args, '--reason'));
    return `haus manual get ${topicId} --intent ${intent} --reason ${reason}`;
}

function shellQuote(value: string): string {
    return /^[^"$`\\!]*$/u.test(value) ? `"${value}"` : `'${value.replaceAll("'", "'\\''")}'`;
}

function requiredManualText(args: ParsedArgs, flag: string): string {
    const value = args.values[flag]?.trim();
    if (!value) {
        throw new AgentCliError('INVALID_ARG', `${flag} is required.`);
    }
    if (value.length < 12 || value.length > 500) {
        throw new AgentCliError('INVALID_ARG', `${flag} must be 12–500 characters.`);
    }
    return value;
}

function defaultDeps(): ManualDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
