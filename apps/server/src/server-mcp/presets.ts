import {
    isMcpBearerTokenPreset,
    isMcpKeylessPreset,
    type McpBearerTokenPreset,
    type McpBearerTokenUpdate,
    type McpBuiltInPreset,
    type McpConnection,
    type McpKeylessPreset,
    type McpOAuthPreset,
    type McpPresetAccountCreate,
    mcpPresetSchema,
    rankWranglerMcpUrl,
} from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireOperableConnection } from './connection-access.ts';
import { mcpBuiltInPresetBrandUrls, resolveMcpConnectionIcon } from './connection-branding.ts';
import { McpDeniedError } from './errors.ts';
import type { McpIconResolver } from './icons.ts';
import type { McpRuntime } from './runtime.ts';
import { createMcpConnection, saveMcpHeaders } from './service.ts';

/**
 * How a preset authenticates. OAuth presets sign in through MCP OAuth
 * discovery; a bearer-token preset sends the Server Owner's own static token,
 * stored Server-side as an `Authorization` header secret.
 */
type PresetAuth =
    | { kind: 'bearer-token' }
    | { kind: 'none' }
    | { kind: 'oauth'; scopes: readonly string[] };

interface PresetDefinition<Auth extends PresetAuth> {
    auth: Auth;
    name: string;
    url: string;
}

const oauthPresets: Record<
    McpOAuthPreset,
    PresetDefinition<Extract<PresetAuth, { kind: 'oauth' }>>
> = {
    cloudflare: {
        auth: { kind: 'oauth', scopes: [] },
        name: 'Cloudflare',
        url: 'https://mcp.cloudflare.com/mcp',
    },
    // Signs in through the Haus GitHub App's client (oauth-clients.ts); a GitHub
    // App has permissions, not scopes. Installations are github/ state.
    github: {
        auth: { kind: 'oauth', scopes: [] },
        name: 'GitHub',
        url: 'https://api.githubcopilot.com/mcp/',
    },
    kittl: {
        auth: { kind: 'oauth', scopes: [] },
        name: 'Kittl',
        url: 'https://mcp.kittl.com/mcp',
    },
    rankwrangler: {
        auth: { kind: 'oauth', scopes: [] },
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
    handmade: {
        auth: { kind: 'oauth', scopes: [] },
        name: 'Handmade',
        url: 'https://handmade.merchbase.co/mcp',
    },
    'merchbase-atlas': {
        auth: { kind: 'oauth', scopes: [] },
        name: 'MerchBase Atlas',
        url: 'https://atlas.merchbase.co/mcp',
    },
    'merchbase-fulfillment': {
        auth: { kind: 'oauth', scopes: [] },
        name: 'MerchBase Fulfillment',
        url: 'https://fulfillment.merchbase.co/mcp/printful',
    },
    tmterminal: {
        auth: { kind: 'oauth', scopes: [] },
        name: 'Trademark Terminal',
        url: 'https://tmterminal.merchbase.co/mcp',
    },
};

/**
 * X's hosted MCP takes no OAuth discovery; an app-only Bearer token reads public posts.
 * Factory authenticates its named agents with their own scoped credentials.
 */
const bearerTokenPresets: Record<
    McpBearerTokenPreset,
    PresetDefinition<Extract<PresetAuth, { kind: 'bearer-token' }>>
> = {
    factory: {
        auth: { kind: 'bearer-token' },
        name: 'Factory',
        url: 'https://factory-agent.merchbase.co/mcp',
    },
    x: { auth: { kind: 'bearer-token' }, name: 'X', url: 'https://api.x.com/mcp' },
};

const keylessPresets: Record<McpKeylessPreset, PresetDefinition<{ kind: 'none' }>> = {
    coingecko: {
        auth: { kind: 'none' },
        name: 'CoinGecko',
        url: 'https://mcp.api.coingecko.com/sse',
    },
};

/**
 * Built-in connections install through their own flow (`linear.startInstall`);
 * the service's public site only supplies their Recommended icon.
 */
const builtInPresetIcons = Object.fromEntries(
    Object.entries(mcpBuiltInPresetBrandUrls).map(([preset, url]) => [preset, { url }])
) as Record<McpBuiltInPreset, { url: string }>;

/** Recommended rows resolve service-owned favicons before OAuth sign-in. */
export async function resolveMcpPresetIcons(resolveIcon: McpIconResolver) {
    const presets = {
        ...oauthPresets,
        ...builtInPresetIcons,
        ...bearerTokenPresets,
        ...keylessPresets,
    };
    return await Promise.all(
        Object.entries(presets).map(async ([id, preset]) => {
            const presetId = mcpPresetSchema.parse(id);
            return {
                icon: await resolveMcpConnectionIcon(resolveIcon, {
                    icon: null,
                    preset: presetId,
                    url: preset.url,
                }),
                preset: presetId,
            };
        })
    );
}

export async function createMcpPresetAccount(
    db: HausDatabase,
    runtime: McpRuntime,
    resolveIcon: McpIconResolver,
    member: HausUser | null,
    input: McpPresetAccountCreate
): Promise<McpConnection> {
    const base = { name: input.name, serverId: input.serverId };
    if (isMcpKeylessPreset(input.preset)) {
        const preset = keylessPresets[input.preset];
        return await createMcpConnection(
            db,
            runtime,
            resolveIcon,
            member,
            { ...base, auth: 'none', headers: {}, oauthScopes: [], url: preset.url },
            input.preset
        );
    }
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
