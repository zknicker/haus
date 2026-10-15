import { readGithubTriggerEvents } from './agent-trigger-github-events.ts';

export { githubOnlyFlags } from './agent-trigger-github-events.ts';

import {
    type AgentGithubTriggerConfigInput,
    type GithubTriggerRepositories,
    githubRepositoryFullNameSchema,
} from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';

// Turns `haus trigger create --kind github` repository flags into the wire
// config (specs/github-triggers.md#agent-cli-and-manual).

/** The Server resolves `account` to an installation you can use. */
export function readGithubTriggerConfig(args: ParsedArgs): AgentGithubTriggerConfigInput {
    const events = readGithubTriggerEvents(args);
    const target = readRepositoryTarget(args);
    return { account: target.owner, events, repositories: target.repositories };
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
        throw new AgentCliError('INVALID_ARG', 'Provide --repo <owner/name> or --org <login>.');
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

/** Repeated flags, each value also split on commas. */
function listValues(args: ParsedArgs, flag: string): string[] {
    const raw = args.valueLists?.[flag] ?? (args.values[flag] ? [args.values[flag]] : []);
    return raw
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}
