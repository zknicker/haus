import * as z from 'zod';
import { artifactErrorCodeSchema } from './artifact-drive.ts';
import { artifactPathSchema } from './artifact-path.ts';
import { artifactAuthorSchema } from './artifacts.ts';

const id = z.string().trim().min(1).max(128);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

/** A deleted file keeps every revision this many days, then only its tombstone remains. */
export const driveDeletedRetentionDays = 30;
/** Most changes one `drive.changes` page returns. */
export const driveChangesPageMax = 1000;
/** Most set-aside files one push close names. */

/** `haus`, `project:<projectId>`, or `agent:<agentId>`. */
export const driveAreaIdSchema = z
    .string()
    .regex(/^(?:haus|project:[A-Za-z0-9_-]{1,128}|agent:[A-Za-z0-9_-]{1,128})$/u);
export type DriveAreaId = z.infer<typeof driveAreaIdSchema>;

const areaCountersSchema = z.record(driveAreaIdSchema, z.number().int().nonnegative());
export type DriveAreaCounters = z.infer<typeof areaCountersSchema>;

export const driveChangesInputSchema = z
    .object({
        serverId: id,
        /** An area missing here reads from zero. */
        since: areaCountersSchema.default({}),
        /** The first page's `until`, passed back unchanged on every further page. */
        until: areaCountersSchema.optional(),
    })
    .strict();
export type DriveChangesInput = z.infer<typeof driveChangesInputSchema>;

export const driveAreaSchema = z
    .object({
        area: driveAreaIdSchema,
        counter: z.number().int().nonnegative(),
        /** The area's folder: `haus`, `projects/<key>`, or `agents/<handle>`. */
        root: z.string(),
    })
    .strict();
export type DriveArea = z.infer<typeof driveAreaSchema>;

export const driveChangeSchema = z.discriminatedUnion('change', [
    z
        .object({
            area: driveAreaIdSchema,
            artifact_id: id,
            change: z.literal('put'),
            content_type: z.string(),
            path: z.string(),
            revision_id: id,
            sequence: z.number().int().positive(),
            sha256,
            size_bytes: z.number().int().nonnegative(),
        })
        .strict(),
    z
        .object({
            area: driveAreaIdSchema,
            artifact_id: id,
            change: z.literal('delete'),
            content_type: z.null(),
            path: z.string(),
            revision_id: z.null(),
            sequence: z.number().int().positive(),
            sha256: z.null(),
            size_bytes: z.null(),
        })
        .strict(),
]);
export type DriveChange = z.infer<typeof driveChangeSchema>;

export const driveChangesResultSchema = z
    .object({
        areas: z.array(driveAreaSchema),
        changes: z.array(driveChangeSchema).max(driveChangesPageMax),
        complete: z.boolean(),
        until: areaCountersSchema,
    })
    .strict();
export type DriveChangesResult = z.infer<typeof driveChangesResultSchema>;

/** The revision now at a path, with its author. */
export const driveRevisionSchema = z
    .object({
        artifact_id: id,
        author: artifactAuthorSchema,
        content_type: z.string(),
        path: z.string(),
        revision_id: id,
        sha256,
        size_bytes: z.number().int().nonnegative(),
    })
    .strict();
export type DriveRevision = z.infer<typeof driveRevisionSchema>;

/** Why a push kept both versions or kept an edit; a refusal carries its error code instead. */
export const driveConflictReasonSchema = z.enum([
    'same_lines',
    'binary',
    'base_gone',
    'both_created',
    'edit_over_delete',
]);
export type DriveConflictReason = z.infer<typeof driveConflictReasonSchema>;

const outcomeBase = { path: z.string() };
export const drivePushOutcomeSchema = z.discriminatedUnion('outcome', [
    z
        .object({ ...outcomeBase, current: driveRevisionSchema, outcome: z.literal('committed') })
        .strict(),
    z
        .object({ ...outcomeBase, current: driveRevisionSchema, outcome: z.literal('merged') })
        .strict(),
    z
        .object({ ...outcomeBase, current: driveRevisionSchema, outcome: z.literal('unchanged') })
        .strict(),
    z
        .object({
            ...outcomeBase,
            current: driveRevisionSchema.nullable(),
            outcome: z.literal('deleted'),
        })
        .strict(),
    z
        .object({
            ...outcomeBase,
            /** The writer's own bytes, saved beside the original. */
            copy: driveRevisionSchema,
            current: driveRevisionSchema.nullable(),
            outcome: z.literal('kept_both'),
            reason: driveConflictReasonSchema,
        })
        .strict(),
    z
        .object({
            ...outcomeBase,
            current: driveRevisionSchema,
            outcome: z.literal('kept_edit'),
            reason: z.literal('edit_over_delete'),
        })
        .strict(),
    z
        .object({
            ...outcomeBase,
            code: artifactErrorCodeSchema,
            current: driveRevisionSchema.nullable(),
            message: z.string(),
            outcome: z.literal('refused'),
        })
        .strict(),
]);
export type DrivePushOutcome = z.infer<typeof drivePushOutcomeSchema>;
export type DrivePushOutcomeKind = DrivePushOutcome['outcome'];

const requestId = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);
const contentType = z
    .string()
    .trim()
    .max(255)
    .regex(/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/u);

/** `POST /api/agent/drive/push/put` query; the body is the raw bytes. */
export const drivePushPutInputSchema = z
    .object({
        base_revision_id: id.optional(),
        content_type: contentType.default('application/octet-stream'),
        path: artifactPathSchema,
        push_id: id,
        request_id: requestId,
    })
    .strict();
export type DrivePushPutInput = z.infer<typeof drivePushPutInputSchema>;

export const drivePushDeleteInputSchema = z
    .object({
        base_revision_id: id,
        path: artifactPathSchema,
        push_id: id,
        request_id: requestId,
    })
    .strict();
export type DrivePushDeleteInput = z.infer<typeof drivePushDeleteInputSchema>;

export const drivePushCloseInputSchema = z.object({ push_id: id }).strict();

/** One file a `drive_conflict` item lists. Null current fields mean nothing is live there. */
export const driveConflictFileSchema = z
    .object({
        copyPath: z.string().nullable(),
        currentAuthorHandle: z.string().nullable(),
        currentRevisionId: id.nullable(),
        outcome: z.enum(['kept_both', 'kept_edit', 'refused']),
        path: z.string(),
        reason: z.union([driveConflictReasonSchema, artifactErrorCodeSchema]),
    })
    .strict();
export type DriveConflictFile = z.infer<typeof driveConflictFileSchema>;

export const drivePushCloseResultSchema = z
    .object({ listed: z.array(driveConflictFileSchema) })
    .strict();
export type DrivePushCloseResult = z.infer<typeof drivePushCloseResultSchema>;

/** A message's citation of a Drive file, bound to a revision; null ids until the path exists. */
export const driveCitationSchema = z
    .object({ artifactId: id.nullable(), path: z.string(), revisionId: id.nullable() })
    .strict();
export type DriveCitation = z.infer<typeof driveCitationSchema>;

/** Deleted files under a folder from the last `driveDeletedRetentionDays` days. */
export const artifactListDeletedInputSchema = z
    .object({
        offset: z.number().int().min(0).max(100_000).default(0),
        prefix: z.union([z.literal(''), artifactPathSchema]).default(''),
        serverId: id,
    })
    .strict();
