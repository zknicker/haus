import { agentSetAgentAvatarReceiptSchema, agentUpdateAgentReceiptSchema } from '@haus/api';
import { AgentApiClient, type AgentApiRequester } from '../agent-api-client.ts';
import { resolveAgentContext } from '../agent-context.ts';
import { AgentCliError } from '../agent-error.ts';
import { shortMessageId } from '../agent-format.ts';
import { isThreadTarget } from '../agent-render.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { assertAgentTarget, requiredValue, valuesFor } from './agent-command-utils.ts';
import { requestAgentCreate } from './agent-create-request.ts';

/** Avatar generation alone takes up to 75 s; an avatar call has to outwait it. */
const avatarTimeoutMs = 75_000;
const maxNameLength = 80;
const maxDescriptionLength = 500;
const maxConceptLength = 280;
const maxSayLength = 4000;
const maxBriefLength = 4000;
const maxChannels = 20;
const handlePattern = /^@?[a-z0-9][a-z0-9-]{1,30}$/u;
const channelPattern = /^#[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u;

const CREATE_RECIPE = `haus agent create --target "#all" --name "Orbit" \\
  --description "Keeps release notes current and chases missing changelog entries." \\
  --channel "#product" \\
  --brief "You own release notes. Draft them from merged PRs, post a digest in #product every Friday, and ask the owner before changing the format." \\
  --avatar-concept "a moonlit raccoon cartographer" \\
  --say "Everyone, meet @orbit, our new release-notes teammate. Orbit drafts the notes from merged PRs and posts a digest in #product every Friday. Say hi, and send lane questions to the owner."`;

export interface AgentAgentDeps {
    /** The Agent running the command; a create's idempotency key is derived from it. */
    callerAgentId: string;
    client: AgentApiRequester;
    write(text: string): void;
}

const CREATE_COMMAND: SubCommand = {
    examples: [CREATE_RECIPE],
    flags: [
        { description: 'Channel, DM, or thread target', name: '--target', valueName: '<target>' },
        { description: 'Display name (1–80 characters)', name: '--name', valueName: '<name>' },
        {
            description: 'What the new Agent is for (1–500 characters)',
            name: '--description',
            valueName: '<text>',
        },
        {
            description: 'Standing brief the new Agent reads on every startup (1–4000 characters)',
            name: '--brief',
            valueName: '<text>',
        },
        {
            description: 'Channel to put it in, repeatable; #all is always joined',
            name: '--channel',
            valueName: '<#name>',
        },
        {
            description: 'Short avatar concept (1–280 characters)',
            name: '--avatar-concept',
            valueName: '<text>',
        },
        {
            description: 'Your announcement; it must name the new Agent as @handle',
            name: '--say',
            valueName: '<text>',
        },
    ],
    name: 'create',
    notes: [
        'Running the identical command again is safe: it returns the teammate the first run',
        'created and creates nothing new. Change any flag and you are asking for a different',
        'Agent, so you get one.',
    ],
    positionals: [],
    run: (args) => runAgentCreate(args, defaultDeps()),
    summary: 'Create one Agent that inherits your runtime, model, reasoning effort, and Computer',
    usage: 'haus agent create --target <target> --name <name> --description <text> [--brief <text>] [--channel <#name>] [--avatar-concept <text>] --say <text>',
};

const UPDATE_COMMAND: SubCommand = {
    examples: [
        'haus agent update --agent @orbit --description "Owns release notes and the changelog."',
    ],
    flags: [
        { description: 'The Agent to update, as @handle', name: '--agent', valueName: '<@handle>' },
        {
            description: 'Replacement description (1–500 characters)',
            name: '--description',
            valueName: '<text>',
        },
    ],
    name: 'update',
    positionals: [],
    run: (args) => runAgentUpdate(args, defaultDeps()),
    summary: "Replace an Agent's description; names and handles are not renamed here",
    usage: 'haus agent update --agent <@handle> --description <text>',
};

const AVATAR_COMMAND: SubCommand = {
    examples: ['haus agent avatar --agent @orbit --concept "a moonlit raccoon cartographer"'],
    flags: [
        {
            description: 'The Agent to re-illustrate, as @handle',
            name: '--agent',
            valueName: '<@handle>',
        },
        {
            description: 'Short avatar concept (1–280 characters)',
            name: '--concept',
            valueName: '<text>',
        },
    ],
    name: 'avatar',
    positionals: [],
    run: (args) => runAgentAvatar(args, defaultDeps()),
    summary: 'Generate and set one Agent avatar from a concept',
    usage: 'haus agent avatar --agent <@handle> --concept <text>',
};

export const AGENT_SUBCOMMANDS: SubCommand[] = [CREATE_COMMAND, UPDATE_COMMAND, AVATAR_COMMAND];

export async function runAgentCreate(args: ParsedArgs, deps: AgentAgentDeps): Promise<number> {
    const target = requiredValue(args, '--target');
    assertAgentTarget(target);
    const displayName = bounded(requiredValue(args, '--name'), '--name', maxNameLength);
    const description = bounded(
        requiredValue(args, '--description'),
        '--description',
        maxDescriptionLength
    );
    const content = bounded(requiredValue(args, '--say'), '--say', maxSayLength);
    const rawConcept = args.values['--avatar-concept']?.trim();
    const avatarConcept = rawConcept
        ? bounded(rawConcept, '--avatar-concept', maxConceptLength)
        : null;
    const rawBrief = args.values['--brief']?.trim();
    const brief = rawBrief ? bounded(rawBrief, '--brief', maxBriefLength) : null;
    const channels = readChannels(args);

    const receipt = await requestAgentCreate(deps.client, deps.callerAgentId, {
        avatarConcept,
        brief,
        channels,
        content,
        description,
        displayName,
        target,
    });

    const { agent } = receipt;
    const lines = [
        `Created @${agent.handle} (${agent.displayName}). Agent ID: ${agent.agentId}`,
        `Runtime ${receipt.runtimeId} · model ${receipt.modelId} · reasoning ${receipt.reasoningEffort} · Computer ${receipt.computerId} — inherited from you.`,
        `In ${receipt.channels.join(', ')}.`,
        brief
            ? 'Its brief is in its memory; it reads it on every startup.'
            : 'No brief: it wakes without standing instructions, so tell it what it owns in the chat.',
        `Posted to ${receipt.target}. Message ID: ${receipt.messageId}`,
        isThreadTarget(receipt.target)
            ? `(discussion continues in "${receipt.target}")`
            : `(discussion continues in this message's thread, target "${receipt.target}:${shortMessageId(receipt.messageId)}")`,
    ];
    if (receipt.avatar.status === 'unavailable') {
        lines.push(`No avatar: ${receipt.avatar.note}`);
    }
    if (receipt.idempotent) {
        lines.push('This request repeated an earlier one; nothing new was created.');
    }
    deps.write(`${lines.join('\n')}\n`);
    return 0;
}

export async function runAgentUpdate(args: ParsedArgs, deps: AgentAgentDeps): Promise<number> {
    const agent = readAgentHandle(args);
    const description = bounded(
        requiredValue(args, '--description'),
        '--description',
        maxDescriptionLength
    );
    const receipt = await deps.client.request(
        '/api/agent/agents/update',
        agentUpdateAgentReceiptSchema,
        { body: { agent, description }, method: 'POST' }
    );
    deps.write(
        `Updated @${receipt.agent.handle} (${receipt.agent.displayName}). Description: ${receipt.agent.description ?? '-'}\n`
    );
    return 0;
}

export async function runAgentAvatar(args: ParsedArgs, deps: AgentAgentDeps): Promise<number> {
    const agent = readAgentHandle(args);
    const concept = bounded(requiredValue(args, '--concept'), '--concept', maxConceptLength);
    const receipt = await deps.client.request(
        '/api/agent/agents/avatar',
        agentSetAgentAvatarReceiptSchema,
        { body: { agent, concept }, method: 'POST', timeoutMs: avatarTimeoutMs }
    );
    const { avatar } = receipt;
    deps.write(
        `New avatar for @${receipt.agent.handle} (${avatar.mediaType}, ${avatar.width}x${avatar.height}, ${avatar.byteSize} bytes)\n`
    );
    return 0;
}

function readChannels(args: ParsedArgs): string[] {
    const channels = [...new Set(valuesFor(args, '--channel').map((value) => value.trim()))];
    for (const channel of channels) {
        if (!channelPattern.test(channel)) {
            throw new AgentCliError('INVALID_TARGET', `Invalid channel "${channel}".`, {
                nextAction: 'Name each channel as --channel "#name".',
            });
        }
    }
    if (channels.length > maxChannels) {
        throw new AgentCliError(
            'INVALID_ARG',
            `--channel may name at most ${maxChannels} channels.`,
            { nextAction: 'Create the Agent in its core channels and add the rest later.' }
        );
    }
    return channels;
}

function readAgentHandle(args: ParsedArgs): string {
    const raw = requiredValue(args, '--agent');
    if (!handlePattern.test(raw)) {
        throw new AgentCliError('INVALID_ARG', `Invalid Agent handle "${raw}".`, {
            nextAction: 'Name one Agent as --agent @handle; run haus server info to list them.',
        });
    }
    return raw;
}

function bounded(value: string, flag: string, maximum: number): string {
    if (value.length > maximum) {
        throw new AgentCliError('INVALID_ARG', `${flag} must be ${maximum} characters or fewer.`, {
            nextAction: `Shorten ${flag} and run the command again.`,
        });
    }
    return value;
}

function defaultDeps(): AgentAgentDeps {
    const context = resolveAgentContext();
    return {
        callerAgentId: context.agentId,
        client: new AgentApiClient(context),
        write: (text) => process.stdout.write(text),
    };
}
