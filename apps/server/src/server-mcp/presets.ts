import {
    isMcpBearerTokenPreset,
    type McpBearerTokenPreset,
    type McpBearerTokenUpdate,
    type McpConnection,
    type McpOAuthPreset,
    type McpPresetAccountCreate,
    rankWranglerMcpUrl,
} from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireOperableConnection } from './connection-access.ts';
import { McpDeniedError } from './errors.ts';
import type { McpIconResolver } from './icons.ts';
import type { McpRuntime } from './runtime.ts';
import { createMcpConnection, saveMcpHeaders } from './service.ts';

/**
 * How a preset authenticates. OAuth presets sign in through MCP OAuth
 * discovery; a bearer-token preset sends the Server Owner's own static token,
 * stored Server-side as an `Authorization` header secret.
 */
type PresetAuth = { kind: 'bearer-token' } | { kind: 'oauth'; scopes: readonly string[] };

interface PresetDefinition<Auth extends PresetAuth> {
    auth: Auth;
    name: string;
    url: string;
}

const oauthPresets: Record<
    McpOAuthPreset,
    PresetDefinition<Extract<PresetAuth, { kind: 'oauth' }>>
> = {
    rankwrangler: {
        auth: { kind: 'oauth', scopes: ['openid', 'email', 'profile'] },
        name: 'RankWrangler',
        url: rankWranglerMcpUrl,
    },
    'google-calendar': {
        auth: { kind: 'oauth', scopes: [] },
        name: 'Google Calendar',
        url: 'https://calendarmcp.googleapis.com/mcp/v1',
    },
    merchbase: {
        auth: { kind: 'oauth', scopes: [] },
        name: 'MerchBase',
        url: 'https://app.merchbase.co/mcp',
    },
};

/** X's hosted MCP takes no OAuth discovery; an app-only Bearer token reads public posts. */
const bearerTokenPresets: Record<
    McpBearerTokenPreset,
    PresetDefinition<Extract<PresetAuth, { kind: 'bearer-token' }>>
> = {
    x: { auth: { kind: 'bearer-token' }, name: 'X', url: 'https://api.x.com/mcp' },
};

export async function createMcpPresetAccount(
    db: HausDatabase,
    runtime: McpRuntime,
    resolveIcon: McpIconResolver,
    member: HausUser | null,
    input: McpPresetAccountCreate
): Promise<McpConnection> {
    const base = { name: input.name, serverId: input.serverId };
    if ('bearerToken' in input) {
        const preset = bearerTokenPresets[input.preset];
        return await createMcpConnection(
            db,
            runtime,
            resolveIcon,
            member,
            {
                ...base,
                auth: 'headers',
                headers: bearerTokenHeaders(input.bearerToken),
                oauthScopes: [],
                url: preset.url,
            },
            input.preset
        );
    }
    const preset = oauthPresets[input.preset];
    return await createMcpConnection(
        db,
        runtime,
        resolveIcon,
        member,
        {
            ...base,
            auth: 'oauth',
            headers: {},
            oauthScopes: [...preset.auth.scopes],
            url: preset.url,
        },
        input.preset
    );
}

/** Replaces a bearer-token preset's token; the header shape stays Server-owned. */
export async function replaceMcpPresetToken(
    db: HausDatabase,
    runtime: McpRuntime,
    resolveIcon: McpIconResolver,
    member: HausUser | null,
    input: McpBearerTokenUpdate
): Promise<McpConnection> {
    const connection = await requireOperableConnection(db, member, input);
    if (!isMcpBearerTokenPreset(connection.preset)) {
        throw new McpDeniedError('This MCP connection does not use a bearer token.');
    }
    return await saveMcpHeaders(
        db,
        runtime,
        resolveIcon,
        connection,
        bearerTokenHeaders(input.bearerToken)
    );
}

function bearerTokenHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}
