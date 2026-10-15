import { type AgentLinearWorkspace, agentLinearWorkspacesSchema } from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';

// Family — Linear (specs/linear-app.md). Read-only: which Linear workspaces the
// Agent can work in and watch with `haus trigger create --kind linear`. Linear
// work itself goes through the Linear connection's tools.

export interface LinearDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

export const LINEAR_SUBCOMMANDS: SubCommand[] = [
    {
        examples: ['haus linear workspaces'],
        flags: [],
        name: 'workspaces',
        positionals: [],
        run: (args) => runLinearWorkspaces(args, defaultLinearDeps()),
        summary: 'List the Linear workspaces and teams you can work in and watch',
        usage: 'haus linear workspaces',
    },
];

export async function runLinearWorkspaces(_args: ParsedArgs, deps: LinearDeps): Promise<number> {
    const { workspaces } = await deps.client.request(
        '/api/agent/linear/workspaces',
        agentLinearWorkspacesSchema,
        { method: 'GET' }
    );
    if (workspaces.length === 0) {
        deps.write(
            'No Linear workspaces you can use. A Haus Owner or Admin connects Linear under Settings → Connections → Linear and grants you the connection.\n'
        );
        return 0;
    }
    deps.write(`${workspaces.map((workspace) => describeWorkspace(workspace)).join('\n')}\n`);
    return 0;
}

function describeWorkspace(workspace: AgentLinearWorkspace): string {
    const status =
        workspace.status === 'active' ? '' : ` · ${workspace.status.replaceAll('_', ' ')}`;
    const actor = workspace.hasIdentity
        ? 'you post as your own Linear identity'
        : 'you post through the Haus app';
    const teams =
        workspace.teams.length > 0
            ? workspace.teams.map((team) => `${team.key} ${team.name}`).join(', ')
            : 'none synced yet';
    return [
        `${workspace.name} [${workspace.urlKey}${status}] ${actor} — use --workspace ${workspace.urlKey}`,
        `  teams: ${teams}`,
    ].join('\n');
}

export function defaultLinearDeps(): LinearDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
