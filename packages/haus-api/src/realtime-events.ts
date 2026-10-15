import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * Focused realtime streams (specs/realtime-events.md). Every Server-rooted
 * stream takes only the Server id; each event type has its own subscription
 * and its own App hook. Events are live notifications carrying ids and small
 * facts: nothing replays, and React Query reads own state and recovery.
 *
 * The Server-level notices below name a record only when the change belongs to
 * exactly one. A missing id means the change is broad and the listener
 * refreshes the whole family.
 */
export const serverStreamInputSchema = z.object({ serverId: idSchema }).strict();

export type ServerStreamInput = z.infer<typeof serverStreamInputSchema>;

/**
 * Why the Server refused or ended a realtime stream, carried in the tRPC error
 * `data` under `realtimeRefusalDataKey`. Only `membership_lost` lets the App
 * clear a Server's caches; `chat_missing` (the named Chat does not exist)
 * runs the Chat-loss purge for that Chat; `role_required` stops that one
 * stream. Any other error (including `UNAUTHORIZED`, which means
 * re-authenticate) is transient.
 */
export const realtimeRefusalSchema = z.enum(['chat_missing', 'membership_lost', 'role_required']);

export type RealtimeRefusal = z.infer<typeof realtimeRefusalSchema>;

export const realtimeRefusalDataKey = 'hausRefusal' as const;

/**
 * `agent.onUpdated`: an Agent's configuration, profile, delivery control,
 * skills, or workspace files, or the roster.
 */
export const agentUpdatedEventSchema = z
    .object({
        agentId: idSchema.nullable(),
        serverId: idSchema,
    })
    .strict();

export type AgentUpdatedEvent = z.infer<typeof agentUpdatedEventSchema>;

/**
 * `computer.onUpdated`: attachment, inventory, update progress, or a report
 * that changed a stored Computer row. Agent-owned skill and workspace changes
 * publish `agent.onUpdated` instead.
 */
export const computerUpdatedEventSchema = z
    .object({
        computerId: idSchema.nullable(),
        serverId: idSchema,
    })
    .strict();

export type ComputerUpdatedEvent = z.infer<typeof computerUpdatedEventSchema>;

/** `mcp.onUpdated`: the Server's MCP connections or their authorization changed. */
export const mcpUpdatedEventSchema = z.object({ serverId: idSchema }).strict();

export type McpUpdatedEvent = z.infer<typeof mcpUpdatedEventSchema>;

/** `linear.onUpdated`: one Linear connection's workspace or Agent identities changed. */
export const linearUpdatedEventSchema = z
    .object({
        connectionId: idSchema,
        serverId: idSchema,
    })
    .strict();

export type LinearUpdatedEvent = z.infer<typeof linearUpdatedEventSchema>;

/** `linear.onIssueChanged`: a delivery changed one Linear issue a chip may show. */
export const linearIssueChangedEventSchema = z
    .object({
        connectionId: idSchema,
        /** The issue key, such as `DES-142`. */
        identifier: z.string().min(1),
        issueId: z.string().min(1),
        serverId: idSchema,
    })
    .strict();

export type LinearIssueChangedEvent = z.infer<typeof linearIssueChangedEventSchema>;

/**
 * `server.onUpdated`: the Server record changed (a rename). Deletion publishes
 * the same notice, but it never reaches a subscriber: deletion revokes every
 * membership, so the per-delivery recheck ends each stream with
 * `membership_lost` instead.
 */
export const serverUpdatedEventSchema = z.object({ serverId: idSchema }).strict();

export type ServerUpdatedEvent = z.infer<typeof serverUpdatedEventSchema>;

/**
 * `member.onUpdated`: one human joined, left, changed role, or edited the
 * profile other members see.
 */
export const memberUpdatedEventSchema = z
    .object({
        memberId: idSchema,
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
