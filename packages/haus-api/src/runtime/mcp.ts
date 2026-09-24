import * as z from 'zod';

export const agentRuntimeMcpConnectionIdSchema = z.string().trim().min(1).max(100);
export const agentRuntimeMcpTransportSchema = z.enum(['http', 'stdio']);
export const agentRuntimeMcpAuthSchema = z.enum(['none', 'headers', 'oauth']);
export const agentRuntimeMcpPresetSchema = z.enum(['google-calendar', 'merchbase', 'rankwrangler']);

export const agentRuntimeMcpToolSchema = z.object({
    annotations: z.record(z.string(), z.unknown()).optional(),
    description: z.string(),
    name: z.string().trim().min(1),
    title: z.string().nullable(),
});

export const agentRuntimeMcpConnectionSchema = z.object({
    accountLabel: z.string().nullable(),
    affectedAgents: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
        })
    ),
    args: z.array(z.string()),
    auth: agentRuntimeMcpAuthSchema,
    builtIn: z.boolean(),
    command: z.string().nullable(),
    connected: z.boolean(),
    headerNames: z.array(z.string()),
    id: agentRuntimeMcpConnectionIdSchema,
    name: z.string().trim().min(1),
    preset: agentRuntimeMcpPresetSchema.nullable(),
    transport: agentRuntimeMcpTransportSchema,
    url: z.string().nullable(),
});

export const agentRuntimeMcpConnectionListSchema = z.object({
    connections: z.array(agentRuntimeMcpConnectionSchema),
});

const agentRuntimeMcpConnectionInputSchema = z
    .object({
        args: z.array(z.string().trim().min(1)).max(50).optional(),
        auth: agentRuntimeMcpAuthSchema.default('none'),
        command: z.string().trim().min(1).max(500).optional(),
        env: z.record(z.string().trim().min(1), z.string().max(4000)).optional(),
        headers: z.record(z.string().trim().min(1), z.string().max(8000)).optional(),
        name: z.string().trim().min(1).max(100),
        oauthClientId: z.string().trim().min(1).max(1000).optional(),
        oauthClientSecret: z.string().max(4000).optional(),
        oauthScopes: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
        url: z.string().trim().url().max(2000).optional(),
    })
    .strict();

export const agentRuntimeMcpConnectionCreateSchema = agentRuntimeMcpConnectionInputSchema
    .refine((value) => Boolean(value.url) !== Boolean(value.command), {
        message: 'Provide either a URL or a command, not both.',
    })
    .refine((value) => value.command === undefined || value.auth !== 'oauth', {
        message: 'OAuth is only available for HTTP connections.',
    })
    .superRefine(validateMcpConnectionInput);

export const agentRuntimeMcpPresetAccountCreateSchema = z.object({
    name: z.string().trim().min(1).max(100),
    preset: agentRuntimeMcpPresetSchema,
});

export const agentRuntimeMcpConnectionUpdateSchema = agentRuntimeMcpConnectionInputSchema
    .partial()
    .extend({
        command: z.string().trim().min(1).max(500).nullable().optional(),
        oauthClientId: z.string().trim().min(1).max(1000).nullable().optional(),
        oauthClientSecret: z.string().max(4000).nullable().optional(),
        oauthScopes: z.array(z.string().trim().min(1).max(500)).max(100).nullable().optional(),
        url: z.string().trim().url().max(2000).nullable().optional(),
    })
    .superRefine((value, context) => {
        if (!value.url) {
            return;
        }
        const url = new URL(value.url);
        if (!isSecureOrLoopbackUrl(value.url)) {
            context.addIssue({
                code: 'custom',
                message: 'HTTP MCP connections must use HTTPS or a loopback HTTP URL.',
            });
        }
        if (url.username || url.password) {
            context.addIssue({
                code: 'custom',
                message: 'MCP connection URLs cannot contain user information.',
            });
        }
    });

export const agentRuntimeMcpToolListSchema = z.object({
    tools: z.array(agentRuntimeMcpToolSchema),
});

export const agentRuntimeMcpConnectionTestResultSchema = z.object({
    error: z.string().nullable(),
    ok: z.boolean(),
    tools: z.array(agentRuntimeMcpToolSchema),
});

export const agentRuntimeMcpOAuthStartSchema = z.object({
    allowAuthorizationServerOrigin: z.boolean().default(false),
    redirectUrl: z
        .string()
        .url()
        .refine(isSecureOrLoopbackUrl, 'OAuth redirects must use HTTPS or a loopback HTTP URL.'),
});

export const agentRuntimeMcpOAuthStartResultSchema = z.object({
    authorizationServerOrigin: z.string().url(),
    authorizationUrl: z.string().url(),
});

export const agentRuntimeMcpOAuthCompleteSchema = z.object({
    code: z.string().trim().min(1),
    redirectUrl: z
        .string()
        .url()
        .refine(isSecureOrLoopbackUrl, 'OAuth redirects must use HTTPS or a loopback HTTP URL.'),
    state: z.string().optional(),
});

export const agentRuntimeMcpAgentToolGrantSchema = z.object({
    agentId: z.string().trim().min(1),
    connectionId: agentRuntimeMcpConnectionIdSchema,
    toolName: z.string().trim().min(1),
});

export const agentRuntimeMcpAgentToolGrantListSchema = z.object({
    grants: z.array(agentRuntimeMcpAgentToolGrantSchema),
});

export const agentRuntimeMcpAgentToolGrantUpdateSchema = z.object({
    enabled: z.boolean(),
});

export const agentRuntimeMcpDisconnectResultSchema = z.object({
    affectedAgents: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
        })
    ),
    ok: z.boolean(),
});

export const agentRuntimeHostToolIdSchema = z.enum(['browser', 'web_fetch']);
export const agentRuntimeHostToolSchema = z.object({
    available: z.boolean(),
    description: z.string(),
    granted: z.boolean(),
    id: agentRuntimeHostToolIdSchema,
    name: z.string(),
});
export const agentRuntimeHostToolListSchema = z.object({
    tools: z.array(agentRuntimeHostToolSchema),
});
export const agentRuntimeHostToolGrantUpdateSchema = z.object({
    enabled: z.boolean(),
});

export type AgentRuntimeMcpAgentToolGrant = z.infer<typeof agentRuntimeMcpAgentToolGrantSchema>;
export type AgentRuntimeMcpAgentToolGrantList = z.infer<
    typeof agentRuntimeMcpAgentToolGrantListSchema
>;
export type AgentRuntimeMcpAgentToolGrantUpdate = z.infer<
    typeof agentRuntimeMcpAgentToolGrantUpdateSchema
>;
export type AgentRuntimeMcpAuth = z.infer<typeof agentRuntimeMcpAuthSchema>;
export type AgentRuntimeMcpConnection = z.infer<typeof agentRuntimeMcpConnectionSchema>;
export type AgentRuntimeMcpConnectionCreate = z.infer<typeof agentRuntimeMcpConnectionCreateSchema>;
export type AgentRuntimeMcpConnectionList = z.infer<typeof agentRuntimeMcpConnectionListSchema>;
export type AgentRuntimeMcpConnectionTestResult = z.infer<
    typeof agentRuntimeMcpConnectionTestResultSchema
>;
export type AgentRuntimeMcpConnectionUpdate = z.infer<typeof agentRuntimeMcpConnectionUpdateSchema>;
export type AgentRuntimeMcpDisconnectResult = z.infer<typeof agentRuntimeMcpDisconnectResultSchema>;
export type AgentRuntimeMcpOAuthComplete = z.infer<typeof agentRuntimeMcpOAuthCompleteSchema>;
export type AgentRuntimeMcpOAuthStart = z.infer<typeof agentRuntimeMcpOAuthStartSchema>;
export type AgentRuntimeMcpOAuthStartResult = z.infer<typeof agentRuntimeMcpOAuthStartResultSchema>;
export type AgentRuntimeMcpPreset = z.infer<typeof agentRuntimeMcpPresetSchema>;
export type AgentRuntimeMcpPresetAccountCreate = z.infer<
    typeof agentRuntimeMcpPresetAccountCreateSchema
>;
export type AgentRuntimeMcpTool = z.infer<typeof agentRuntimeMcpToolSchema>;
export type AgentRuntimeMcpToolList = z.infer<typeof agentRuntimeMcpToolListSchema>;
export type AgentRuntimeHostToolId = z.infer<typeof agentRuntimeHostToolIdSchema>;
export type AgentRuntimeHostTool = z.infer<typeof agentRuntimeHostToolSchema>;
export type AgentRuntimeHostToolList = z.infer<typeof agentRuntimeHostToolListSchema>;

function validateMcpConnectionInput(
    value: z.infer<typeof agentRuntimeMcpConnectionInputSchema>,
    context: z.RefinementCtx
) {
    if (value.url) {
        const url = new URL(value.url);
        if (!isSecureOrLoopbackUrl(value.url)) {
            context.addIssue({
                code: 'custom',
                message: 'HTTP MCP connections must use HTTPS or a loopback HTTP URL.',
            });
        }
        if (url.username || url.password) {
            context.addIssue({
                code: 'custom',
                message: 'MCP connection URLs cannot contain user information.',
            });
        }
    }
    if (
        value.auth !== 'oauth' &&
        (value.oauthClientId ||
            value.oauthClientSecret ||
            (value.oauthScopes && value.oauthScopes.length > 0))
    ) {
        context.addIssue({
            code: 'custom',
            message: 'OAuth client settings require OAuth authentication.',
        });
    }
    if (value.oauthClientSecret && !value.oauthClientId) {
        context.addIssue({
            code: 'custom',
            message: 'An OAuth client secret requires a client ID.',
        });
    }
}

function isSecureOrLoopbackUrl(value: string) {
    const url = new URL(value);
    return (
        url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
            (url.hostname === '127.0.0.1' ||
                url.hostname === '[::1]' ||
                url.hostname === 'localhost'))
    );
}
