import { readGithubTriggerEvents } from './agent-trigger-github-events.ts';

export { githubOnlyFlags } from './agent-trigger-github-events.ts';

import {
    type AgentGithubInstallation,
    agentGithubInstallationsSchema,
    type GithubTriggerConfigInput,
    type GithubTriggerRepositories,
    githubRepositoryFullNameSchema,
} from '@haus/api';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';

// Turns `haus trigger create --kind github` flags into the wire config
// (specs/github-triggers.md#agent-cli-and-manual). Each filter flag applies to
// every listed event that takes it; a value lands on the events that accept it.

/** Filter flags and the event field each one fills. */
export async function readGithubTriggerConfig(
    args: ParsedArgs,
    client: AgentApiRequester
): Promise<GithubTriggerConfigInput> {
    const events = readGithubTriggerEvents(args);
    const target = readRepositoryTarget(args);
    const installation = await resolveInstallation(client, target.owner);
    return { events, installationId: installation.id, repositories: target.repositories };
}

interface RepositoryTarget {
    owner: string;
    repositories: GithubTriggerRepositories;
}

function readRepositoryTarget(args: ParsedArgs): RepositoryTarget {
    const repos = listValues(args, '--repo');
    const org = args.values['--org']?.trim();
    if (repos.length > 0 && org) {
        throw new AgentCliError('INVALID_ARG', 'Use --repo or --org, not both.', {
            nextAction:
                '--org watches every repository you can reach in that account; --repo narrows to named ones.',
        });
    }
    if (org) {
        return { owner: org, repositories: { scope: 'installation' } };
    }
    if (repos.length === 0) {
        throw new AgentCliError('INVALID_ARG', 'Provide --repo <owner/name> or --org <login>.', {
            nextAction: 'Run haus github installations --repos to see what you can watch.',
        });
    }
    for (const repo of repos) {
        if (!githubRepositoryFullNameSchema.safeParse(repo).success) {
            throw new AgentCliError('INVALID_ARG', `--repo ${repo} is not owner/name.`);
        }
    }
    const owners = new Set(repos.map((repo) => repo.split('/')[0]?.toLowerCase()));
    if (owners.size > 1) {
        throw new AgentCliError('INVALID_ARG', 'One Trigger watches one GitHub account.', {
            nextAction: 'Create one Trigger per owner.',
        });
    }
    return {
        owner: repos[0]?.split('/')[0] ?? '',
        repositories: { names: repos, scope: 'repositories' },
    };
}

async function resolveInstallation(
    client: AgentApiRequester,
    owner: string
): Promise<AgentGithubInstallation> {
    const { installations } = await client.request(
        '/api/agent/github/installations',
        agentGithubInstallationsSchema,
        { method: 'GET' }
    );
    const installation = installations.find(
        (candidate) => candidate.account.login.toLowerCase() === owner.toLowerCase()
    );
    if (!installation) {
        const known = installations.map((candidate) => candidate.account.login).join(', ');
        throw new AgentCliError(
            'INVALID_TARGET',
            `No Haus GitHub installation you can use covers ${owner}.`,
            {
                nextAction: `${known ? `You can use: ${known}. ` : ''}Otherwise ask a GitHub owner of ${owner} to install the Haus GitHub App, and a Haus Owner or Admin to add it and grant you the GitHub connection.`,
            }
        );
    }
    if (installation.status !== 'active') {
        throw new AgentCliError(
            'INVALID_TARGET',
            `The ${owner} installation is ${installation.status}.`,
            {
                nextAction: `Ask a GitHub owner of ${owner} to restore the Haus GitHub App.`,
            }
        );
    }
    return installation;
}

/** Repeated flags, each value also split on commas. */
function listValues(args: ParsedArgs, flag: string): string[] {
    const raw = args.valueLists?.[flag] ?? (args.values[flag] ? [args.values[flag]] : []);
    return raw
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}
