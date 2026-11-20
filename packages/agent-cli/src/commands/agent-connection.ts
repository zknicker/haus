import * as z from 'zod';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';

// Tolerant copies of the `@haus/api` shapes: a key a newer Server adds is dropped, never
// refused, so an older Computer keeps working (specs/haus-cli.md §8).
const connectionAgentSchema = z.object({
    displayName: z.string(),
    handle: z.string(),
    id: z.string(),
});
const connectionListSchema = z.object({
    connections: z.array(
        z.object({
            agents: z.array(connectionAgentSchema),
            connected: z.boolean(),
            id: z.string(),
            name: z.string(),
        })
    ),
});
const grantReceiptSchema = z.object({
    agent: connectionAgentSchema,
    changed: z.boolean(),
    connection: z.object({ id: z.string(), name: z.string() }),
    enabled: z.boolean(),
});

type ConnectionList = z.infer<typeof connectionListSchema>;
type GrantReceipt = z.infer<typeof grantReceiptSchema>;

interface ConnectionDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

const adminNote =
    'Only a connection admin can run these: an Agent a Server Owner or Admin turned Connection admin on for. Others get CONNECTION_ADMIN_REQUIRED.';

const targetFlags = [
    {
        name: '--agent',
        valueName: '<agent>',
        description: 'Agent id, @handle, or exact display name (yourself included)',
    },
    {
        name: '--connection',
        valueName: '<connection>',
        description: 'Connection id or exact name, as haus connection list shows it',
    },
];

export const CONNECTION_SUBCOMMANDS: SubCommand[] = [
    {
        examples: ['haus connection list'],
        flags: [],
        name: 'list',
        notes: [adminNote],
        positionals: [],
        run: () => runConnectionList(defaultDeps()),
        summary: "List this Server's connections and which Agents can use each",
        usage: 'haus connection list',
    },
    {
        examples: [
            'haus connection grant --agent @wren --connection Linear',
            'haus connection grant --agent @forge --connection mcp_AbCdEfGh12345678',
        ],
        flags: targetFlags,
        name: 'grant',
        notes: [
            adminNote,
            'The connection must be connected. Granting access an Agent already has changes nothing.',
        ],
        positionals: [],
        run: (args) => runConnectionGrant(args, true, defaultDeps()),
        summary: 'Let one Agent use one connection',
        usage: 'haus connection grant --agent <agent> --connection <connection>',
    },
    {
        examples: ['haus connection revoke --agent @wren --connection Linear'],
        flags: targetFlags,
        name: 'revoke',
        notes: [adminNote, 'Revoking access an Agent does not have changes nothing.'],
        positionals: [],
        run: (args) => runConnectionGrant(args, false, defaultDeps()),
        summary: "Turn off one Agent's access to one connection",
        usage: 'haus connection revoke --agent <agent> --connection <connection>',
    },
];

export async function runConnectionList(deps: ConnectionDeps): Promise<number> {
    const response = await deps.client.request('/api/agent/connections', connectionListSchema);
    deps.write(renderConnectionList(response));
    return 0;
}

export async function runConnectionGrant(
    args: ParsedArgs,
    enabled: boolean,
    deps: ConnectionDeps
): Promise<number> {
    const agent = args.values['--agent']?.trim();
    const connection = args.values['--connection']?.trim();
    if (!(agent && connection)) {
        const verb = enabled ? 'grant' : 'revoke';
        throw new AgentCliError('INVALID_ARG', 'Provide both --agent and --connection.', {
            nextAction: `haus connection ${verb} --agent @handle --connection <name>`,
        });
    }
    const receipt = await deps.client.request(
        `/api/agent/connections/${enabled ? 'grant' : 'revoke'}`,
        grantReceiptSchema,
        { body: { agent, connection }, method: 'POST' }
    );
    deps.write(renderGrantReceipt(receipt));
    return 0;
}

export function renderConnectionList(list: ConnectionList): string {
    if (list.connections.length === 0) {
        return 'This Server has no connections. A Server Owner or Admin adds them in Settings → Connections.\n';
    }
    const lines = list.connections.map((connection) => {
        const state = connection.connected ? 'connected' : 'not connected';
        const agents =
            connection.agents.length === 0
                ? 'no Agents'
                : connection.agents.map((agent) => `@${agent.handle}`).join(', ');
        return `${connection.name} (${connection.id}) · ${state} · ${agents}`;
    });
    return `${lines.join('\n')}\n`;
}

export function renderGrantReceipt(receipt: GrantReceipt): string {
    const who = `@${receipt.agent.handle}`;
    const what = receipt.connection.name;
    if (!receipt.changed) {
        return receipt.enabled
            ? `${who} already had access to ${what}. Nothing changed.\n`
            : `${who} already had no access to ${what}. Nothing changed.\n`;
    }
    return receipt.enabled
        ? `${who} can now use ${what}.\n`
        : `${who} can no longer use ${what}.\n`;
}

function defaultDeps(): ConnectionDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
