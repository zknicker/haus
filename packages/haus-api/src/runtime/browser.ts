import * as z from 'zod';

export const agentRuntimeBrowserStateSchema = z.enum(['healthy', 'degraded']);
export const agentRuntimeBrowserStatusSchema = z
    .object({
        browserVersion: z.string().trim().min(1).nullable(),
        cdpState: z.enum(['healthy', 'unreachable', 'unknown']),
        checkedAt: z.string().datetime(),
        pid: z.number().int().positive().nullable(),
        reason: z.string().trim().min(1).nullable(),
        running: z.boolean(),
        state: agentRuntimeBrowserStateSchema,
        uptimeSeconds: z.number().int().min(0).nullable(),
    })
    .strict();

export const agentRuntimeBrowserConnectionSchema = z
    .object({
        applicationPath: z.string().trim().min(1),
        userDataDir: z.string().trim().min(1),
    })
    .strict();

export const agentRuntimeBrowserSettingsSchema = z
    .object({
        browsers: z.array(
            agentRuntimeBrowserConnectionSchema
                .extend({
                    name: z.string().min(1),
                    version: z.string().nullable(),
                    available: z.boolean(),
                })
                .strict()
        ),
        connection: agentRuntimeBrowserConnectionSchema.nullable(),
        configured: z.boolean(),
        enabled: z.boolean(),
        status: agentRuntimeBrowserStatusSchema.nullable(),
        updatedAt: z.string().datetime().nullable(),
    })
    .strict();

export const agentRuntimeSaveBrowserSettingsSchema = z
    .object({
        enabled: z.boolean().optional(),
        connection: agentRuntimeBrowserConnectionSchema.optional(),
    })
    .strict();

export type AgentRuntimeBrowserState = z.infer<typeof agentRuntimeBrowserStateSchema>;
export type AgentRuntimeBrowserStatus = z.infer<typeof agentRuntimeBrowserStatusSchema>;
export type AgentRuntimeBrowserSettings = z.infer<typeof agentRuntimeBrowserSettingsSchema>;
export type AgentRuntimeSaveBrowserSettings = z.infer<typeof agentRuntimeSaveBrowserSettingsSchema>;
export type AgentRuntimeBrowserConnection = z.infer<typeof agentRuntimeBrowserConnectionSchema>;
