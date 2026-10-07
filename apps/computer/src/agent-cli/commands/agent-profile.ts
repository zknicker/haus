import {
    AGENT_CONVERSATION_STYLE_MAX_LENGTH,
    AGENT_DESCRIPTION_MAX_LENGTH,
    type AgentSelfProfileUpdateInput,
    agentSelfProfileUpdateInputSchema,
} from '@haus/api';
import type * as z from 'zod';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { agentProfileResponseSchema } from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';

interface ProfileDeps {
    client: AgentApiRequester;
    readStdin(): Promise<string>;
    write(text: string): void;
}

type Profile = z.infer<typeof agentProfileResponseSchema>['profile'];

/** The pickup reaction an Agent uses when it has not chosen one. Computer applies it. */
const DEFAULT_SIGNATURE_EMOJI = '👀';

export const PROFILE_SUBCOMMANDS: SubCommand[] = [
    {
        allowExtraPositionals: true,
        examples: ['haus profile show', 'haus profile show @Wren'],
        flags: [],
        name: 'show',
        positionals: [],
        run: (args) => runProfileShow(args, defaultDeps()),
        summary: 'Show your profile or another participant profile',
        usage: 'haus profile show [@handle]',
    },
    {
        examples: [
            'haus profile update --description "Resident systems investigator"',
            'haus profile update --conversation-style "Dry wit, nautical asides, never more than one per reply"',
            'haus profile update --conversation-style - < style.md',
            'haus profile update --emoji 🦊',
            'haus profile update --clear-conversation-style --clear-emoji',
        ],
        flags: [
            {
                description: `Your role in one or two sentences (1–${AGENT_DESCRIPTION_MAX_LENGTH} characters)`,
                name: '--description',
                valueName: '<text>',
            },
            {
                description: `Your voice on top of the house personality (up to ${AGENT_CONVERSATION_STYLE_MAX_LENGTH} characters); - reads stdin`,
                name: '--conversation-style',
                valueName: '<text|->',
            },
            {
                description: 'Remove your conversation style',
                name: '--clear-conversation-style',
            },
            {
                description: 'Your signature pickup reaction: exactly one emoji',
                name: '--emoji',
                valueName: '<emoji>',
            },
            {
                description: `Go back to the default pickup reaction (${DEFAULT_SIGNATURE_EMOJI})`,
                name: '--clear-emoji',
            },
        ],
        name: 'update',
        notes: [
            'Your conversation style and emoji are private to you and your Owners and Admins.',
            'Tune them only when an Owner or Admin asks; your next turn picks the change up.',
        ],
        positionals: [],
        run: (args) => runProfileUpdate(args, defaultDeps()),
        summary: 'Update your description, conversation style, or signature emoji',
        usage: 'haus profile update [--description <text>] [--conversation-style <text|->] [--emoji <emoji>]',
    },
];

export async function runProfileShow(args: ParsedArgs, deps: ProfileDeps): Promise<number> {
    if (args.positionals.length > 1) {
        throw new AgentCliError('INVALID_ARG', 'Profile show accepts at most one @handle.');
    }
    const target = args.positionals[0];
    if (target && !/^@[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u.test(target)) {
        throw new AgentCliError('INVALID_ARG', 'Profile target must be an @handle.');
    }
    const response = await deps.client.request('/api/agent/profile', agentProfileResponseSchema, {
        query: { target },
    });
    deps.write(renderProfile(response.profile));
    if (response.profile.isSelf) {
        deps.write(
            'Update it with: haus profile update --description <text> | --conversation-style <text> | --emoji <emoji>\n'
        );
    }
    return 0;
}

export async function runProfileUpdate(args: ParsedArgs, deps: ProfileDeps): Promise<number> {
    const body = await readProfileUpdate(args, deps);
    const response = await deps.client.request(
        '/api/agent/profile/update',
        agentProfileResponseSchema,
        { body, method: 'POST' }
    );
    deps.write(renderProfile(response.profile));
    if (body.description !== undefined) {
        deps.write('This description rides every message you send.\n');
    }
    return 0;
}

/** Turns the flags into one self-update body, refusing contradictions before any request. */
export async function readProfileUpdate(
    args: ParsedArgs,
    deps: Pick<ProfileDeps, 'readStdin'>
): Promise<AgentSelfProfileUpdateInput> {
    const description = args.values['--description'];
    const style = args.values['--conversation-style'];
    const emoji = args.values['--emoji'];
    const clearStyle = args.flags['--clear-conversation-style'] === true;
    const clearEmoji = args.flags['--clear-emoji'] === true;
    if (style !== undefined && clearStyle) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Use --conversation-style or --clear-conversation-style, not both.'
        );
    }
    if (emoji !== undefined && clearEmoji) {
        throw new AgentCliError('INVALID_ARG', 'Use --emoji or --clear-emoji, not both.');
    }
    if (
        description !== undefined &&
        (!description || description.length > AGENT_DESCRIPTION_MAX_LENGTH)
    ) {
        throw new AgentCliError(
            'INVALID_ARG',
            `Provide --description with 1–${AGENT_DESCRIPTION_MAX_LENGTH} characters.`,
            {
                nextAction:
                    'Write a one-or-two-sentence role line; keep longer context in MEMORY.md.',
            }
        );
    }
    const draft: Record<string, string | null> = {};
    if (description !== undefined) {
        draft.description = description;
    }
    if (clearStyle) {
        draft.conversationStyle = null;
    } else if (style !== undefined) {
        draft.conversationStyle = style === '-' ? await deps.readStdin() : style;
    }
    if (clearEmoji) {
        draft.signatureEmoji = null;
    } else if (emoji !== undefined) {
        draft.signatureEmoji = emoji;
    }
    if (Object.keys(draft).length === 0) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide --description, --conversation-style, --emoji, or a --clear flag.',
            { nextAction: 'Run haus profile update --help for the flags.' }
        );
    }
    const parsed = agentSelfProfileUpdateInputSchema.safeParse(draft);
    if (!parsed.success) {
        throw new AgentCliError(
            'INVALID_ARG',
            parsed.error.issues[0]?.message ?? 'The profile update was invalid.'
        );
    }
    return parsed.data;
}

function renderProfile(profile: Profile) {
    const lines = [
        `Handle: @${profile.handle}`,
        `Description: ${profile.description ?? '(no description)'}`,
    ];
    if (profile.isSelf) {
        lines.push(
            `Signature emoji: ${profile.signatureEmoji ?? `${DEFAULT_SIGNATURE_EMOJI} (default)`}`,
            `Conversation style: ${profile.conversationStyle ?? '(none; the house personality alone)'}`
        );
    }
    return `${lines.join('\n')}\n`;
}

function defaultDeps(): ProfileDeps {
    return {
        client: createAgentApiClient(),
        readStdin: readAgentStdin,
        write: (text) => process.stdout.write(text),
    };
}
