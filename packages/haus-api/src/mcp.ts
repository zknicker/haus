import * as z from 'zod';
import { idSchema } from './chat.ts';

const mcpConnectionIdSchema = z
    .string()
    .regex(/^mcp_[A-Za-z0-9_-]{16}$/u, 'Invalid MCP connection id.');
const toolNameSchema = z.string().trim().min(1).max(200);
export const mcpPresetSchema = z.enum(['google-calendar', 'merchbase']);

export const mcpGrantSchema = z
    .object({
        agentId: idSchema,
        connectionId: mcpConnectionIdSchema,
    })
    .strict();

/**
 * A connection's icon, already resolved and inlined by Haus Server.
 *
 * The contract stores bytes, never a remote URL: the App renders this straight
 * into an `img` tag, and a third-party URL there would beacon the viewer's IP
 * to the connection's operator on every page view. Server fetches once at
 * discovery and inlines the result, so the shape itself is what makes the
 * render safe — if it parsed, it is inline data.
 *
 * Raster only, deliberately. SVG is the one image format that can carry script
 * and fetch subresources, and screening it properly needs a real parser rather
 * than a token blocklist. At icon scale it buys nothing, so it is not accepted.
 */
export const mcpIconMediaTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/x-icon'] as const;

export type McpIconMediaType = (typeof mcpIconMediaTypes)[number];

/** Per-variant ceiling. Icons render at ~32px; this is generous for that. */
export const mcpIconMaxBytes = 64 * 1024;

/** Base64 inflates the byte ceiling by 4/3; the slack covers padding. */
const iconBase64MaxLength = Math.ceil((mcpIconMaxBytes * 4) / 3) + 64;

/** Built from the media types above so the two cannot drift apart. */
const iconDataUrlPattern = new RegExp(
    `^data:(${mcpIconMediaTypes.map((type) => type.replaceAll(/[+/]/gu, String.raw`\$&`)).join('|')});base64,[A-Za-z0-9+/]+={0,2}$`,
    'u'
);

export const mcpIconDataUrlSchema = z.string().max(iconBase64MaxLength).regex(iconDataUrlPattern);

/**
 * A `dark` variant only when it genuinely differs; one icon serving both themes
 * is stored in `light` alone, and the App falls back to it. Storing it twice
 * would double this payload on a query that returns every connection inline.
 */
export const mcpIconSchema = z
    .object({
        dark: mcpIconDataUrlSchema.nullable(),
        light: mcpIconDataUrlSchema.nullable(),
    })
    .strict()
    .refine((icon) => icon.dark !== null || icon.light !== null, {
        message: 'An icon must carry at least one variant.',
    });

export type McpIcon = z.infer<typeof mcpIconSchema>;

/**
 * The server's own one-line description of itself, taken from the `instructions`
 * it returns at initialize. Those instructions are written for a model and run
 * to thousands of characters, so Server keeps only the opening line — the part
 * that reads as a description to a person.
 */
export const mcpSummarySchema = z.string().trim().min(1).max(200);

export const mcpConnectionSchema = z
    .object({
        accountLabel: z.string().trim().min(1).max(200).nullable(),
        auth: z.enum(['headers', 'none', 'oauth']),
        connected: z.boolean(),
        grants: z.array(mcpGrantSchema),
        headerNames: z.array(z.string()).max(50),
        icon: mcpIconSchema.nullable(),
        id: mcpConnectionIdSchema,
        name: z.string().trim().min(1).max(100),
        preset: mcpPresetSchema.nullable(),
        serverId: idSchema,
        status: z.enum(['online', 'pending']),
        summary: mcpSummarySchema.nullable(),
        tools: z.array(toolNameSchema),
        url: z.string().url(),
    })
    .strict();

export const mcpConnectionCreateSchema = z
    .object({
        auth: z.enum(['headers', 'none', 'oauth']).default('none'),
        headers: z.record(z.string().trim().min(1), z.string().max(8000)).default({}),
        name: z.string().trim().min(1).max(100),
        oauthClientId: z.string().trim().min(1).max(1000).optional(),
        oauthClientSecret: z.string().max(4000).optional(),
        oauthScopes: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
        serverId: idSchema,
        url: z.string().url().max(2000),
    })
    .strict()
    .superRefine((value, context) => {
        const url = new URL(value.url);
        const loopback = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname);
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
            context.addIssue({
                code: 'custom',
                message: 'HTTP MCP connections must use HTTPS or loopback HTTP.',
            });
        }
        if (url.username || url.password) {
            context.addIssue({ code: 'custom', message: 'MCP URLs cannot contain credentials.' });
        }
        if (value.oauthClientSecret && !value.oauthClientId) {
            context.addIssue({
                code: 'custom',
                message: 'An OAuth client secret requires a client ID.',
            });
        }
        if (
            value.auth !== 'oauth' &&
            (value.oauthClientId || value.oauthClientSecret || value.oauthScopes.length > 0)
        ) {
            context.addIssue({
                code: 'custom',
                message: 'OAuth client settings require OAuth authentication.',
            });
        }
    });

export const mcpPresetAccountCreateSchema = z
    .object({
        name: z.string().trim().min(1).max(100),
        preset: mcpPresetSchema,
        serverId: idSchema,
    })
    .strict();

export const mcpOAuthStartSchema = z
    .object({
        allowAuthorizationServerOrigin: z.boolean().default(false),
        connectionId: mcpConnectionIdSchema,
        redirectUrl: z.string().url().max(2000),
        serverId: idSchema,
    })
    .strict();

export const mcpOAuthStartResultSchema = z.discriminatedUnion('status', [
    z
        .object({
            authorizationUrl: z.string().url(),
            status: z.literal('ready'),
        })
        .strict(),
    z
        .object({
            authorizationServerOrigin: z.string().url(),
            status: z.literal('trust-required'),
        })
        .strict(),
]);

export const mcpConnectionListInputSchema = z.object({ serverId: idSchema }).strict();
export const mcpConnectionListSchema = z.array(mcpConnectionSchema);
export const mcpConnectionInputSchema = z
    .object({ connectionId: mcpConnectionIdSchema, serverId: idSchema })
    .strict();
export const mcpHeadersUpdateSchema = mcpConnectionInputSchema
    .extend({
        headers: z.record(z.string().trim().min(1), z.string().max(8000)),
    })
    .strict();

export const mcpGrantInputSchema = mcpGrantSchema.extend({
    enabled: z.boolean(),
    serverId: idSchema,
});

export type McpConnection = z.infer<typeof mcpConnectionSchema>;
export type McpConnectionCreate = z.infer<typeof mcpConnectionCreateSchema>;
export type McpGrant = z.infer<typeof mcpGrantSchema>;
export type McpOAuthStart = z.infer<typeof mcpOAuthStartSchema>;
export type McpOAuthStartResult = z.infer<typeof mcpOAuthStartResultSchema>;
export type McpPreset = z.infer<typeof mcpPresetSchema>;
export type McpPresetAccountCreate = z.infer<typeof mcpPresetAccountCreateSchema>;

/** Agent-scoped catalog and invocation contracts; credentials stay on Server. */
export const agentMcpToolSchema = z.object({
    description: z.string(),
    inputSchema: z.record(z.string(), z.unknown()),
    name: z.string().min(1).max(256),
    title: z.string().nullable(),
});
export const agentMcpToolsSchema = z.object({ tools: z.array(agentMcpToolSchema) });
export const agentMcpInvocationSchema = z
    .object({
        args: z.unknown(),
        toolName: z.string().trim().min(1).max(256),
    })
    .strict();
export const agentMcpResultSchema = z.object({ result: z.unknown() });

export const agentMcpRequestIdSchema = z.uuid();

export const agentMcpSearchSchema = z.object({
    tools: z.array(agentMcpToolSchema.omit({ inputSchema: true })),
    total: z.number().int().nonnegative(),
});
export const agentMcpCatalogQuerySchema = z.union([
    z.object({ query: z.string().max(200) }).strict(),
    z.object({ name: z.string().min(1).max(256) }).strict(),
    z.object({}).strict(),
]);
