import { type AgentGithubInstallation, agentGithubInstallationsSchema } from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';

// Family — GitHub (ADR 0042). Read-only: which Haus GitHub App installations
// the Agent can watch with `haus trigger create --kind github`.

export interface GithubDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

export const GITHUB_SUBCOMMANDS: SubCommand[] = [
    {
        examples: ['haus github installations', 'haus github installations --repos'],
        flags: [
            {
                description: 'Also list the repositories you can reach in each installation',
                name: '--repos',
            },
        ],
        name: 'installations',
        positionals: [],
        run: (args) => runGithubInstallations(args, defaultGithubDeps()),
        summary: 'List the GitHub accounts and repositories your github Triggers can watch',
        usage: 'haus github installations [--repos]',
    },
];

export async function runGithubInstallations(args: ParsedArgs, deps: GithubDeps): Promise<number> {
    const repos = args.flags['--repos'] === true;
    const { installations } = await deps.client.request(
        '/api/agent/github/installations',
        agentGithubInstallationsSchema,
        { method: 'GET', query: repos ? { repos: true } : {} }
    );
    if (installations.length === 0) {
        deps.write(
            'No GitHub installations you can use. A GitHub org owner installs the Haus GitHub App, then a Haus Owner or Admin adds it under Settings → Connections → GitHub and grants you the connection.\n'
        );
        return 0;
    }
    deps.write(`${installations.map((row) => describeInstallation(row)).join('\n')}\n`);
    return 0;
}

function describeInstallation(installation: AgentGithubInstallation): string {
    const { account } = installation;
    const selection =
        installation.repositorySelection === 'all' ? 'all repositories' : 'selected repositories';
    const status = installation.status === 'active' ? '' : ` · ${installation.status}`;
    const lines = [
        `${account.login} [${account.type}${status}] ${selection}, ${installation.accessibleRepositoryCount} you can reach — use --org ${account.login} or --repo ${account.login}/<name>`,
    ];
    for (const repository of installation.repositories ?? []) {
        lines.push(`  ${repository.fullName}${repository.private ? ' (private)' : ''}`);
    }
    return lines.join('\n');
}

export function defaultGithubDeps(): GithubDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
