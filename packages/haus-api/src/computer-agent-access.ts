import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * A Device's **Agent access** list (ADR 0057 decision 4): which Agents may run
 * any tool there. Home Agents always may and are not listed. Every other Agent
 * is named by the Device's attacher, one grant at a time.
 */
export const computerAgentAccessInputSchema = z
    .object({ agentId: idSchema, computerId: idSchema, serverId: idSchema })
    .strict();
export type ComputerAgentAccessInput = z.infer<typeof computerAgentAccessInputSchema>;

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
 * The Agent access list as `computer.list` shows it. `canGrantAgentAccess` is
 * the attacher only; `canRevokeAgentAccess` is the attacher, an Owner, or an
 * Admin. `computer.grantAgentAccess` and `computer.revokeAgentAccess` publish
 * `computer.updated`. A revoke fences the Agent's calls there and deletes its
 * computer use entry on the Device.
 */
export const computerAgentAccessSettingsSchema = z
    .object({
        agentAccessGrants: z.array(computerAgentAccessGrantSchema).max(500),
        canGrantAgentAccess: z.boolean(),
        canRevokeAgentAccess: z.boolean(),
    })
    .strict();
export type ComputerAgentAccessSettings = z.infer<typeof computerAgentAccessSettingsSchema>;

/**
 * One row of `haus computer list` (`GET /api/agent/computers`): every Computer
 * on the Agent's Server. `home` is the Agent's home Computer, `allowed` is
 * whether its Agent access list allows this Agent, and `computerUse` is
 * whether a `desktop` call from this Agent would pass the computer use list.
 */
export const agentComputerEntrySchema = z
    .object({
        allowed: z.boolean(),
        computerId: idSchema,
        computerUse: z.boolean(),
        home: z.boolean(),
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
