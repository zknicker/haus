import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * A Device's **Agent access** (ADR 0057 decision 4, amended 2026-11-23), which
 * the App calls Captain access: which Agents may run any tool there. The Agent
 * whose Machine (`agents.computerId`) is the Device always may. `selected`, the
 * default, allows the named grants too; `all` allows every live Agent on the
 * Server, and keeps the named grants for a later return to `selected`.
 */
export const computerAgentAccessScopeSchema = z.enum(['selected', 'all']);
export type ComputerAgentAccessScope = z.infer<typeof computerAgentAccessScopeSchema>;

/** `computer.grantAgentAccess` (attacher only) and `computer.revokeAgentAccess`. */
export const computerAgentAccessInputSchema = z
    .object({ agentId: idSchema, computerId: idSchema, serverId: idSchema })
    .strict();
export type ComputerAgentAccessInput = z.infer<typeof computerAgentAccessInputSchema>;

/**
 * `computer.setAgentAccessScope`: only the attacher widens to `all`; the
 * attacher, an Owner, or an Admin narrows to `selected`, which fences the
 * Agents it bars as a revoke does. Publishes `computer.updated`.
 */
export const computerSetAgentAccessScopeInputSchema = z
    .object({ computerId: idSchema, scope: computerAgentAccessScopeSchema, serverId: idSchema })
    .strict();
export type ComputerSetAgentAccessScopeInput = z.infer<
    typeof computerSetAgentAccessScopeInputSchema
>;

/** One named grant, with the person who granted it. */
export const computerAgentAccessGrantSchema = z
    .object({
        agentId: idSchema,
        grantedAt: z.date(),
        grantedByUserId: idSchema,
    })
    .strict();
export type ComputerAgentAccessGrant = z.infer<typeof computerAgentAccessGrantSchema>;

/**
 * Agent access as `computer.list` shows it. `canGrantAgentAccess` (a grant or
 * `all`) is the attacher only; `canRevokeAgentAccess` (a revoke or `selected`)
 * is the attacher, an Owner, or an Admin. `computer.grantAgentAccess` and
 * `computer.revokeAgentAccess` publish `computer.updated`. A revoke fences the
 * Agent's calls there unless `all` still allows it.
 */
export const computerAgentAccessSettingsSchema = z
    .object({
        agentAccessGrants: z.array(computerAgentAccessGrantSchema).max(500),
        agentAccessScope: computerAgentAccessScopeSchema,
        canGrantAgentAccess: z.boolean(),
        canRevokeAgentAccess: z.boolean(),
    })
    .strict();
export type ComputerAgentAccessSettings = z.infer<typeof computerAgentAccessSettingsSchema>;

/**
 * One row of `haus computer list` (`GET /api/agent/computers`): every Computer
 * on the Agent's Server. `machine` is the Agent's Machine, `allowed` is whether
 * Agent access allows this Agent there, and `computerUse` is whether a
 * `desktop` call from this Agent would pass the switch.
 */
export const agentComputerEntrySchema = z
    .object({
        allowed: z.boolean(),
        computerId: idSchema,
        computerUse: z.boolean(),
        machine: z.boolean(),
        name: z.string().trim().min(1).max(100).nullable(),
        online: z.boolean(),
        operatingSystem: z.string().trim().min(1).max(100).nullable(),
    })
    .strict();
export type AgentComputerEntry = z.infer<typeof agentComputerEntrySchema>;

export const agentComputerListResponseSchema = z
    .object({ computers: z.array(agentComputerEntrySchema).max(200) })
    .strict();
export type AgentComputerListResponse = z.infer<typeof agentComputerListResponseSchema>;
