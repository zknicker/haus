import { agentCreateChannelReceiptSchema } from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';

interface ChannelCreateDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

export const CHANNEL_CREATE_SUBCOMMAND: SubCommand = {
    examples: [
        'haus channel create --name alerts --human @zach --description "Sentry and uptime alerts"',
    ],
    flags: [
        { name: '--name', valueName: '<name>', description: 'Channel name, with or without #' },
        {
            name: '--human',
            valueName: '<@handle>',
            description: 'A human who should see it, usually who asked (repeatable)',
        },
        {
            name: '--description',
            valueName: '<text>',
            description: 'What the channel is for (at most 500 characters)',
        },
    ],
    name: 'create',
    notes: [
        'You join the channel you create. Humans see a channel only once they are in it,',
        'so name the human who asked; add other Agents afterwards with haus channel add.',
        'Check haus server info --channels --query <name> first; a taken name is refused.',
    ],
    positionals: [],
    run: (args) => runChannelCreate(args, defaultDeps()),
    summary: 'Create a channel; you and the named humans join it',
    usage: 'haus channel create --name <name> --human <@handle> [--description <text>]',
};

export async function runChannelCreate(args: ParsedArgs, deps: ChannelCreateDeps): Promise<number> {
    const name = (args.values['--name'] ?? '').trim().replace(/^#/u, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u.test(name)) {
        throw new AgentCliError(
            'INVALID_ARG',
            '--name must be 1-32 letters, numbers, hyphens, or underscores, starting with a letter or number.'
        );
    }
    const humans = args.valueLists?.['--human'] ?? [];
    if (humans.length === 0) {
        throw new AgentCliError('INVALID_ARG', 'Name at least one human with --human @handle.', {
            nextAction:
                'Pass the human who asked for the channel; run haus server info --humans to list them.',
        });
    }
    const invalid = humans.find((human) => !/^@?[a-z0-9][a-z0-9-]{1,30}$/iu.test(human.trim()));
    if (invalid !== undefined) {
        throw new AgentCliError(
            'INVALID_ARG',
            `--human must name one human as @handle, not "${invalid}".`,
            {
                nextAction: 'Run haus server info --humans to list them.',
            }
        );
    }
    const description = args.values['--description']?.trim();
    const receipt = await deps.client.request(
        '/api/agent/channels/create',
        agentCreateChannelReceiptSchema,
        {
            body: { ...(description ? { description } : {}), humans, name },
            method: 'POST',
        }
    );
    const people = receipt.humans.map((handle) => `@${handle}`).join(', ');
    deps.write(
        `Created ${receipt.target}. You and ${people} are in it.\n` +
            `Next: post there with haus message send --target "${receipt.target}", or add an Agent with haus channel add --target "${receipt.target}" --agent @handle.\n`
    );
    return 0;
}

function defaultDeps(): ChannelCreateDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
