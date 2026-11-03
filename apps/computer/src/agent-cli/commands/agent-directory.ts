import { agentAddChannelAgentReceiptSchema } from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import {
    agentChannelActionResponseSchema,
    agentChannelMembersSchema,
    agentChannelSchema,
    agentServerInfoSchema,
} from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import { renderChannelInfo, renderChannelMembers, renderServerInfo } from '../agent-render.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { CHANNEL_CREATE_SUBCOMMAND } from './agent-channel-create.ts';
import { optionalInteger } from './agent-command-utils.ts';

interface DirectoryDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

export const SERVER_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus server info',
            'haus server info --channels --joined',
            'haus server info --agents --query research',
        ],
        flags: [
            { name: '--channels', description: 'List channels' },
            { name: '--agents', description: 'List agents' },
            { name: '--humans', description: 'List humans' },
            { name: '--joined', description: 'Limit channels to joined channels' },
            {
                name: '--query',
                valueName: '<text>',
                description: 'Filter handles and descriptions',
            },
            { name: '--limit', valueName: '<n>', description: 'Maximum rows per section' },
            { name: '--offset', valueName: '<n>', description: 'Server-side row offset' },
        ],
        name: 'info',
        positionals: [],
        run: (args) => runServerInfo(args, defaultDeps()),
        summary: 'Inspect bounded server channels and participant handles',
        usage: 'haus server info [--channels|--agents|--humans] [--joined] [--query <text>] [--limit <n>] [--offset <n>]',
    },
];

export const CHANNEL_SUBCOMMANDS: SubCommand[] = [
    {
        examples: ['haus channel info "#general"'],
        flags: [],
        name: 'info',
        positionals: ['<target>'],
        run: (args) => runChannelInfo(args, defaultDeps()),
        summary: 'Inspect one channel and its joined state',
        usage: 'haus channel info <target>',
    },
    {
        examples: ['haus channel members "#general"'],
        flags: [],
        name: 'members',
        positionals: ['<target>'],
        run: (args) => runChannelMembers(args, defaultDeps()),
        summary: 'List one channel’s members and role labels',
        usage: 'haus channel members <target>',
    },
    CHANNEL_CREATE_SUBCOMMAND,
    {
        examples: ['haus channel add --target "#product" --agent @orbit'],
        flags: [
            { name: '--target', valueName: '<t>', description: 'Channel target (#name)' },
            { name: '--agent', valueName: '<@handle>', description: 'The Agent to put in it' },
        ],
        name: 'add',
        positionals: [],
        run: (args) => runChannelAdd(args, defaultDeps()),
        summary: 'Put another Agent in a channel',
        usage: 'haus channel add --target <t> --agent <@handle>',
    },
    channelActionSubcommand('join', {
        confirmation: (target) => `Joined ${target}. Channel messages now reach your inbox.`,
        example: 'haus channel join --target "#general"',
        summary: 'Join a channel so ordinary delivery reaches you',
    }),
    channelActionSubcommand('leave', {
        confirmation: (target) => `Left ${target}.`,
        example: 'haus channel leave --target "#general"',
        summary: 'Leave a channel you have joined',
    }),
    channelActionSubcommand('mute', {
        confirmation: (target) =>
            `Muted ${target}. Personal @mentions and DMs still reach you; reverse with haus channel unmute.`,
        example: 'haus channel mute --target "#general"',
        summary: 'Mute ordinary delivery from a channel and its threads',
    }),
    channelActionSubcommand('unmute', {
        confirmation: (target) => `Unmuted ${target}. Ordinary delivery resumes.`,
        example: 'haus channel unmute --target "#general"',
        summary: 'Reverse a channel mute',
    }),
];

function channelActionSubcommand(
    action: 'join' | 'leave' | 'mute' | 'unmute',
    copy: { confirmation(target: string): string; example: string; summary: string }
): SubCommand {
    return {
        examples: [copy.example],
        flags: [{ name: '--target', valueName: '<t>', description: 'Channel target (#name)' }],
        name: action,
        positionals: [],
        run: (args) => runChannelAction(action, args, defaultDeps(), copy.confirmation),
        summary: copy.summary,
        usage: `haus channel ${action} --target <t>`,
    };
}

async function runChannelAction(
    action: 'join' | 'leave' | 'mute' | 'unmute',
    args: ParsedArgs,
    deps: DirectoryDeps,
    confirmation: (target: string) => string
): Promise<number> {
    const target = requiredChannelFlag(args);
    const response = await deps.client.request(
        `/api/agent/channels/${action}`,
        agentChannelActionResponseSchema,
        { body: { target }, method: 'POST' }
    );
    deps.write(`${confirmation(response.target)}\n`);
    return 0;
}

export async function runChannelAdd(args: ParsedArgs, deps: DirectoryDeps): Promise<number> {
    const target = requiredChannelFlag(args);
    const agent = args.values['--agent']?.trim();
    if (!(agent && /^@?[a-z0-9][a-z0-9-]{1,30}$/u.test(agent))) {
        throw new AgentCliError('INVALID_ARG', '--agent must name one Agent as @handle.', {
            nextAction: 'Run haus server info --agents to list them.',
        });
    }
    const response = await deps.client.request(
        '/api/agent/channels/add',
        agentAddChannelAgentReceiptSchema,
        { body: { agent, target }, method: 'POST' }
    );
    deps.write(
        response.added
            ? `Added @${response.handle} to ${response.target}.\n`
            : `@${response.handle} was already in ${response.target}.\n`
    );
    return 0;
}

export async function runServerInfo(args: ParsedArgs, deps: DirectoryDeps): Promise<number> {
    const response = await deps.client.request('/api/agent/server', agentServerInfoSchema, {
        query: {
            agents: flagOrUndefined(args, '--agents'),
            channels: flagOrUndefined(args, '--channels'),
            humans: flagOrUndefined(args, '--humans'),
            joined: flagOrUndefined(args, '--joined'),
            limit: optionalInteger(args, '--limit', { minimum: 1 }),
            offset: optionalInteger(args, '--offset', { minimum: 0 }),
            query: args.values['--query'],
        },
    });
    deps.write(
        renderServerInfo(response, {
            joined: Boolean(args.flags['--joined']),
            query: args.values['--query'],
        })
    );
    return 0;
}

export async function runChannelInfo(args: ParsedArgs, deps: DirectoryDeps): Promise<number> {
    const target = channelTarget(args);
    const response = await deps.client.request('/api/agent/channels/info', agentChannelSchema, {
        query: { target },
    });
    deps.write(renderChannelInfo(response));
    return 0;
}

export async function runChannelMembers(args: ParsedArgs, deps: DirectoryDeps): Promise<number> {
    const target = channelTarget(args);
    const response = await deps.client.request(
        '/api/agent/channels/members',
        agentChannelMembersSchema,
        { query: { target } }
    );
    deps.write(renderChannelMembers(response));
    return 0;
}

function requiredChannelFlag(args: ParsedArgs): string {
    const target = args.values['--target'];
    if (!(target && /^#[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u.test(target))) {
        throw new AgentCliError('INVALID_TARGET', 'A #channel target is required.');
    }
    return target;
}

function channelTarget(args: ParsedArgs): string {
    const target = args.positionals[0];
    if (!(target && /^#[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u.test(target))) {
        throw new AgentCliError('INVALID_TARGET', 'A #channel target is required.');
    }
    return target;
}

function flagOrUndefined(args: ParsedArgs, flag: string): true | undefined {
    return args.flags[flag] ? true : undefined;
}

function defaultDeps(): DirectoryDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
