import {
    AGENT_DESCRIPTION_MAX_LENGTH,
    agentSetAgentAvatarReceiptSchema,
    agentUpdateAgentReceiptSchema,
    signatureEmojiInputSchema,
    signatureEmojiRule,
    TASK_KEY_PREFIX_PATTERN,
} from '@haus/api';
import { AgentApiClient, type AgentApiRequester } from '../agent-api-client.ts';
import { resolveAgentContext } from '../agent-context.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { assertAgentTarget, requiredValue } from './agent-command-utils.ts';
import { requestAgentCreate } from './agent-create-request.ts';

/** Avatar generation alone takes up to 75 s; an avatar call has to outwait it. */
const avatarTimeoutMs = 75_000;
const maxNameLength = 80;
const maxConceptLength = 280;
const maxBriefLength = 4000;
const handlePattern = /^@?[a-z0-9][a-z0-9-]{1,30}$/u;

const CREATE_RECIPE = `haus agent create --target "#haus" --name "Orbit" \\
  --description "Keeps release notes current and chases missing changelog entries." \\
  --project PRD \\
  --brief "You own release notes. Draft them from merged PRs, post a digest in #product every Friday, and ask the owner before changing the format." \\
  --avatar-concept "a moonlit raccoon cartographer" --emoji 🦝`;

export interface AgentAgentDeps {
    /** The Agent running the command; a create's idempotency key is derived from it. */
    callerAgentId: string;
    client: AgentApiRequester;
    write(text: string): void;
}

const CREATE_COMMAND: SubCommand = {
    examples: [CREATE_RECIPE],
    flags: [
        {
            description: 'Conversation where the human asked for this Agent',
            name: '--target',
            valueName: '<target>',
        },
        { description: 'Display name (1–80 characters)', name: '--name', valueName: '<name>' },
        {
            description: `Its role in one or two sentences (1–${AGENT_DESCRIPTION_MAX_LENGTH} characters); longer context goes in --brief`,
            name: '--description',
            valueName: '<text>',
        },
        {
            description: 'Standing brief the new Agent reads on every startup (1–4000 characters)',
            name: '--brief',
            valueName: '<text>',
        },
        {
            description: 'Key of its Project, which it hears; omitted, it joins your own Project',
            name: '--project',
            valueName: '<KEY>',
        },
        {
            description: 'Short avatar concept (1–280 characters)',
            name: '--avatar-concept',
            valueName: '<text>',
        },
        {
            description: 'Its signature pickup reaction: exactly one emoji (default 👀)',
            name: '--emoji',
            valueName: '<emoji>',
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
    usage: 'haus agent create --target <target> --name <name> --description <text> --brief <text> [--project <KEY>] [--avatar-concept <text>] [--emoji <emoji>]',
};

const UPDATE_COMMAND: SubCommand = {
    examples: [
        'haus agent update --agent @orbit --description "Owns release notes and the changelog."',
    ],
    flags: [
        { description: 'The Agent to update, as @handle', name: '--agent', valueName: '<@handle>' },
        {
            description: `Replacement role line (1–${AGENT_DESCRIPTION_MAX_LENGTH} characters)`,
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
    const description = boundedDescription(requiredValue(args, '--description'));
    const rawConcept = args.values['--avatar-concept']?.trim();
    const avatarConcept = rawConcept
        ? bounded(rawConcept, '--avatar-concept', maxConceptLength)
        : null;
    const brief = bounded(requiredValue(args, '--brief'), '--brief', maxBriefLength);
    const project = readProject(args);
    const signatureEmoji = readSignatureEmoji(args);

    const receipt = await requestAgentCreate(deps.client, deps.callerAgentId, {
        avatarConcept,
        brief,
        description,
        displayName,
        project,
        signatureEmoji,
        target,
    });

    const { agent } = receipt;
    const lines = [
        `Created @${agent.handle} (${agent.displayName}). Agent ID: ${agent.agentId}`,
        `Runtime ${receipt.runtimeId} · model ${receipt.modelId} · reasoning ${receipt.reasoningEffort} · Computer ${receipt.computerId} — inherited from you.`,
        `Project: ${receipt.project}. It hears that Project's channel and Tasks.`,
        'Its brief is in its memory; it reads it on every startup.',
        `@${agent.handle} introduces itself in #haus on its first turn; do not post an introduction for it. Answer the human in ${receipt.target}.`,
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
    const description = boundedDescription(requiredValue(args, '--description'));
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

/** Uppercased here so `prd` and `PRD` derive the same nonce. */
function readProject(args: ParsedArgs) {
    const raw = args.values['--project'];
    if (raw === undefined) {
        return null;
    }
    const project = raw.trim().toUpperCase();
    if (!TASK_KEY_PREFIX_PATTERN.test(project)) {
        throw new AgentCliError('INVALID_ARG', `Invalid Project key "${raw}".`, {
            nextAction:
                'Name the Project by its key, as --project PRD. haus server info --channels lists each key.',
        });
    }
    return project;
}

/** Normalized here so the derived nonce matches what the Server stores. */
function readSignatureEmoji(args: ParsedArgs): string | null {
    const raw = args.values['--emoji'];
    if (raw === undefined) {
        return null;
    }
    const parsed = signatureEmojiInputSchema.safeParse(raw);
    if (!parsed.success) {
        throw new AgentCliError('INVALID_ARG', signatureEmojiRule, {
            nextAction: 'Pass one emoji, for example --emoji 🦊, or leave --emoji off for 👀.',
        });
    }
    return parsed.data;
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

/** A description rides every message the Agent sends, so the refusal names where detail goes. */
function boundedDescription(value: string): string {
    if (value.length > AGENT_DESCRIPTION_MAX_LENGTH) {
        throw new AgentCliError(
            'INVALID_ARG',
            `--description must be ${AGENT_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
            {
                nextAction:
                    'Write a one-or-two-sentence role line; longer context belongs in the standing brief.',
            }
        );
    }
    return value;
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
