import * as z from 'zod';
import { idSchema } from './chat.ts';

/**
 * Connection admins: Agents a Server Owner or Admin trusts to turn connection access on and off
 * for any Agent on the Server, themselves included. Only a human sets the flag (specs/mcp.md).
 */

/** Owner/Admin write of one Agent's connection admin flag (`agent.setConnectionAdmin`). */
export const setAgentConnectionAdminInputSchema = z
    .object({
        agentId: idSchema,
        connectionAdmin: z.boolean(),
        serverId: idSchema,
    })
    .strict();

export type SetAgentConnectionAdminInput = z.infer<typeof setAgentConnectionAdminInputSchema>;

export const agentConnectionAdminSchema = z
    .object({ agentId: idSchema, connectionAdmin: z.boolean() })
    .strict();

export type AgentConnectionAdmin = z.infer<typeof agentConnectionAdminSchema>;

/** Refusal code for a connection route called by an Agent that is not a connection admin. */
export const CONNECTION_ADMIN_REQUIRED = 'CONNECTION_ADMIN_REQUIRED';

const agentConnectionAgentSchema = z
    .object({
        displayName: z.string(),
        handle: z.string(),
        id: idSchema,
    })
    .strict();

export type AgentConnectionAgent = z.infer<typeof agentConnectionAgentSchema>;

/**
 * One connection as a connection admin sees it: identity, whether it is connected, and which
 * Agents may use it. No URL, header names, account labels, or secrets.
 */
export const agentConnectionEntrySchema = z
    .object({
        agents: z.array(agentConnectionAgentSchema),
        connected: z.boolean(),
        id: idSchema,
        name: z.string(),
    })
    .strict();

export type AgentConnectionEntry = z.infer<typeof agentConnectionEntrySchema>;

/** `GET /api/agent/connections` (`haus connection list`). */
export const agentConnectionListSchema = z
    .object({ connections: z.array(agentConnectionEntrySchema) })
    .strict();

export type AgentConnectionList = z.infer<typeof agentConnectionListSchema>;

/**
 * `POST /api/agent/connections/grant` and `/revoke`. Each names one Agent (id, `@handle`, or
 * exact display name) and one connection (id or exact name); an ambiguous name is refused.
 */
export const agentConnectionGrantInputSchema = z
    .object({
        agent: z.string().trim().min(1).max(200),
        connection: z.string().trim().min(1).max(200),
    })
    .strict();

export type AgentConnectionGrantInput = z.infer<typeof agentConnectionGrantInputSchema>;

export const agentConnectionGrantReceiptSchema = z
    .object({
        agent: agentConnectionAgentSchema,
        /** False when the Agent already had (grant) or already lacked (revoke) access. */
        changed: z.boolean(),
        connection: z.object({ id: idSchema, name: z.string() }).strict(),
        enabled: z.boolean(),
    })
    .strict();

export type AgentConnectionGrantReceipt = z.infer<typeof agentConnectionGrantReceiptSchema>;
