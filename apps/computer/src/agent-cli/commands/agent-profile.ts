import { AGENT_DESCRIPTION_MAX_LENGTH } from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { agentProfileResponseSchema } from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';

interface ProfileDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

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
        examples: ['haus profile update --description "Resident systems investigator"'],
        flags: [
            {
                description: `Your role in one or two sentences (1–${AGENT_DESCRIPTION_MAX_LENGTH} characters)`,
                name: '--description',
                valueName: '<text>',
            },
        ],
        name: 'update',
        positionals: [],
        run: (args) => runProfileUpdate(args, defaultDeps()),
        summary: 'Update your self-authored description; your name remains your handle',
        usage: 'haus profile update --description <text>',
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
        deps.write('Update it with: haus profile update --description <text>\n');
    }
    return 0;
}

export async function runProfileUpdate(args: ParsedArgs, deps: ProfileDeps): Promise<number> {
    const description = args.values['--description'];
    if (!description || description.length > AGENT_DESCRIPTION_MAX_LENGTH) {
        throw new AgentCliError(
            'INVALID_ARG',
            `Provide --description with 1–${AGENT_DESCRIPTION_MAX_LENGTH} characters.`,
            {
                nextAction:
                    'Write a one-or-two-sentence role line; keep longer context in MEMORY.md.',
            }
        );
    }
    const response = await deps.client.request(
        '/api/agent/profile/update',
        agentProfileResponseSchema,
        { body: { description }, method: 'POST' }
    );
    deps.write(renderProfile(response.profile));
    deps.write('This description rides every message you send.\n');
    return 0;
}

function renderProfile(profile: { description: string | null; handle: string }) {
    return `Handle: @${profile.handle}\nDescription: ${profile.description ?? '(no description)'}\n`;
}

function defaultDeps(): ProfileDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
