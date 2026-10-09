import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * Focused realtime streams (specs/realtime-events.md). Every Server-rooted
 * stream takes only the Server id; each event type has its own subscription
 * and its own App hook. Events are live notifications: nothing replays, and
 * React Query reads own state and recovery.
 *
 * The Server-level notices below name a record only when the change belongs to
 * exactly one. A missing id means the change is broad and the listener
 * refreshes the whole family.
 */
export const serverStreamInputSchema = z.object({ serverId: idSchema }).strict();

export type ServerStreamInput = z.infer<typeof serverStreamInputSchema>;

/** `agent.onUpdated`: an Agent's configuration, profile, delivery control, or the roster. */
export const agentUpdatedEventSchema = z
    .object({
        agentId: idSchema.nullable(),
        serverId: idSchema,
    })
    .strict();

export type AgentUpdatedEvent = z.infer<typeof agentUpdatedEventSchema>;

/**
 * `computer.onUpdated`: attachment, inventory, update progress, or a report
 * that changed a stored row. `agentId` names the one Agent whose Computer-side
 * state (skills, workspace) moved, when there is one.
 */
export const computerUpdatedEventSchema = z
    .object({
        agentId: idSchema.nullable(),
        computerId: idSchema.nullable(),
        serverId: idSchema,
    })
    .strict();

export type ComputerUpdatedEvent = z.infer<typeof computerUpdatedEventSchema>;

/** `mcp.onUpdated`: the Server's MCP connections or their authorization changed. */
export const mcpUpdatedEventSchema = z.object({ serverId: idSchema }).strict();

export type McpUpdatedEvent = z.infer<typeof mcpUpdatedEventSchema>;

/** `server.onUpdated`: the Server record itself was renamed or deleted. */
export const serverUpdatedEventSchema = z
    .object({
        action: z.enum(['deleted', 'updated']),
        serverId: idSchema,
    })
    .strict();

export type ServerUpdatedEvent = z.infer<typeof serverUpdatedEventSchema>;

/**
 * `member.onUpdated`: a human joined, left, changed role, or edited the
 * profile other members see. `memberId` names that human when there is one.
 */
export const memberUpdatedEventSchema = z
    .object({
        memberId: idSchema.nullable(),
        serverId: idSchema,
    })
    .strict();

export type MemberUpdatedEvent = z.infer<typeof memberUpdatedEventSchema>;

/** `invitation.onUpdated`: an invitation was created, revoked, or accepted. */
export const invitationUpdatedEventSchema = z.object({ serverId: idSchema }).strict();

export type InvitationUpdatedEvent = z.infer<typeof invitationUpdatedEventSchema>;

/** `cloudAgentSettings.onUpdated`: the Server's Cloud Agent settings changed. */
export const cloudAgentSettingsUpdatedEventSchema = z.object({ serverId: idSchema }).strict();

export type CloudAgentSettingsUpdatedEvent = z.infer<typeof cloudAgentSettingsUpdatedEventSchema>;
