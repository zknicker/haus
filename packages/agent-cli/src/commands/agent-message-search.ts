import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { agentSearchResponseSchema } from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import { renderSearchFooter, renderSearchResult } from '../agent-render.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { assertAgentTarget, optionalInteger, requiredValue } from './agent-command-utils.ts';

interface SearchDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

export const messageSearchSubcommand: SubCommand = {
    examples: [
        'haus message search --query "release notes"',
        'haus message search --query deploy --target "#general" --sort recent',
    ],
    flags: [
        { name: '--query', valueName: '<text>', description: 'Text to find' },
        { name: '--target', valueName: '<target>', description: 'Limit search to one target' },
        { name: '--sender', valueName: '<handle>', description: 'Limit search to one sender' },
        {
            name: '--sort',
            valueName: '<relevance|recent>',
            description: 'Order matching messages',
        },
        { name: '--before', valueName: '<time>', description: 'Only messages before ISO time' },
        { name: '--after', valueName: '<time>', description: 'Only messages after ISO time' },
        { name: '--limit', valueName: '<n>', description: 'Maximum results to return' },
        { name: '--offset', valueName: '<n>', description: 'Server-side result offset' },
    ],
    name: 'search',
    positionals: [],
    run: (args) => runSearch(args, defaultDeps()),
    summary: 'Search messages across joined channels and DMs',
    usage: 'haus message search --query <text> [--target <t>] [--sender <handle>] [--sort relevance|recent] [--before <time>] [--after <time>] [--limit <n>] [--offset <n>]',
};

export async function runSearch(args: ParsedArgs, deps: SearchDeps): Promise<number> {
    const query = requiredValue(args, '--query');
    const target = args.values['--target']?.trim();
    if (target) {
        assertAgentTarget(target);
    }
    const sort = searchSort(args.values['--sort']);
    const response = await deps.client.request(
        '/api/agent/messages/search',
        agentSearchResponseSchema,
        {
            query: {
                after: args.values['--after'],
                before: args.values['--before'],
                limit: optionalInteger(args, '--limit', { minimum: 1 }),
                offset: optionalInteger(args, '--offset', { minimum: 0 }),
                q: query,
                sender: args.values['--sender'],
                sort,
                target,
            },
        }
    );
    const blocks = response.messages.map((message) =>
        renderSearchResult(message.target, message, query)
    );
    deps.write(`${[...blocks, renderSearchFooter()].join('\n\n')}\n`);
    return 0;
}

function searchSort(value: string | undefined): 'recent' | 'relevance' | undefined {
    if (value === undefined || value === 'recent' || value === 'relevance') {
        return value;
    }
    throw new AgentCliError('INVALID_ARG', '--sort must be relevance or recent.');
}

function defaultDeps(): SearchDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
