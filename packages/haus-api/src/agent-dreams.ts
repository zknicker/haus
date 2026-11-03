import * as z from 'zod';
import { agentDetailInputSchema } from './agent.ts';
import { idSchema } from './chat.ts';
import { timestampSchema } from './chat-contract-primitives.ts';

/** One file's patch text is dropped past this size; its counts stay. */
export const dreamFilePatchLimitBytes = 64 * 1024;
/** A dream's whole patch never exceeds this; later files keep counts only. */
export const dreamPatchLimitBytes = 256 * 1024;
/** The Server keeps this many newest dreams per Agent. */
export const dreamRetentionPerAgent = 60;

/**
 * One memory file a dream changed (`MEMORY.md` or a path under `notes/`). `omitted`
 * marks a file whose text is not in the patch: `binary` has no line counts, and
 * `too-large` keeps its counts but its hunks passed a size cap.
 */
export const agentDreamFileSchema = z
    .object({
        added: z.number().int().nonnegative(),
        change: z.enum(['added', 'modified', 'deleted']),
        omitted: z.enum(['binary', 'too-large']).optional(),
        path: z.string().trim().min(1).max(1024),
        removed: z.number().int().nonnegative(),
    })
    .strict();

export type AgentDreamFile = z.infer<typeof agentDreamFileSchema>;

/** The Computer snapshots at most this many memory files per dream. */
export const dreamFileLimit = 2000;

const dreamFilesSchema = z.array(agentDreamFileSchema).max(dreamFileLimit);

/**
 * Computer→Server, once a dream run settles: what the Agent's memory pass changed,
 * as file stats plus one unified diff (`diff --git a/<path> b/<path>` per file,
 * hunk headers naming the enclosing `## ` section). A dream that changed nothing
 * still reports, with no files and an empty patch. `truncated` means memory held
 * more than {@link dreamFileLimit} files, so nothing was compared: no files, no patch.
 */
export const agentDreamRecordSchema = z
    .object({
        agentId: idSchema,
        files: dreamFilesSchema,
        finishedAt: timestampSchema,
        patch: z.string().max(dreamPatchLimitBytes),
        runId: idSchema,
        startedAt: timestampSchema,
        truncated: z.boolean(),
        type: z.literal('agent-dream-record'),
    })
    .strict()
    .refine((record) => !record.truncated || (record.files.length === 0 && record.patch === ''), {
        message: 'A truncated dream record compares nothing.',
        path: ['truncated'],
    });

export type AgentDreamRecord = z.infer<typeof agentDreamRecordSchema>;

/** Newest-first keyset cursor: the last dream's start, ties broken by run. */
export const agentDreamsCursorSchema = z
    .object({ runId: idSchema, startedAt: timestampSchema })
    .strict();

export const agentDreamsInputSchema = agentDetailInputSchema.extend({
    cursor: agentDreamsCursorSchema.optional(),
    limit: z.number().int().min(1).max(dreamRetentionPerAgent).default(20),
});

export type AgentDreamsInput = z.infer<typeof agentDreamsInputSchema>;

/** Who a follow-up is for: the author of the reminder's anchor message. */
export const agentDreamFollowUpRequesterSchema = z
    .object({
        displayName: z.string(),
        handle: z.string().nullable(),
        kind: z.enum(['agent', 'human']),
    })
    .strict();

export type AgentDreamFollowUpRequester = z.infer<typeof agentDreamFollowUpRequesterSchema>;

/** A reminder the Agent set for itself while dreaming. */
export const agentDreamFollowUpSchema = z
    .object({
        anchorChatId: idSchema,
        fireAt: timestampSchema,
        reminderId: idSchema,
        /** Null when the anchor message or its author no longer exists. */
        requester: agentDreamFollowUpRequesterSchema.nullable(),
        title: z.string(),
    })
    .strict();

export type AgentDreamFollowUp = z.infer<typeof agentDreamFollowUpSchema>;

/** One dream in a list: when it ran and what it touched, without the patch. */
export const agentDreamSummarySchema = z
    .object({
        added: z.number().int().nonnegative(),
        files: dreamFilesSchema,
        finishedAt: timestampSchema,
        /** Reminders the Agent created during the run, derived at read. */
        followUps: z.array(agentDreamFollowUpSchema),
        removed: z.number().int().nonnegative(),
        runId: idSchema,
        startedAt: timestampSchema,
        /** The "what I learned" text from `haus heartbeat learned`; null when it wrote none. */
        summary: z.string().nullable(),
        /** Memory held too many files to compare; `files` is empty. */
        truncated: z.boolean(),
    })
    .strict();

export type AgentDreamSummary = z.infer<typeof agentDreamSummarySchema>;

export const agentDreamsPageSchema = z
    .object({
        dreams: z.array(agentDreamSummarySchema),
        nextCursor: agentDreamsCursorSchema.nullable(),
    })
    .strict();

export type AgentDreamsPage = z.infer<typeof agentDreamsPageSchema>;

export const agentDreamInputSchema = agentDetailInputSchema.extend({ runId: idSchema });

export type AgentDreamInput = z.infer<typeof agentDreamInputSchema>;

/** One dream with its patch; null when no record exists (pruned, or never reported). */
export const agentDreamDetailSchema = agentDreamSummarySchema
    .extend({ patch: z.string().max(dreamPatchLimitBytes) })
    .nullable();

export type AgentDreamDetail = NonNullable<z.infer<typeof agentDreamDetailSchema>>;
