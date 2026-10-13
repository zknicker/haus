import * as z from 'zod';
import { artifactFolderSchema, artifactPathSchema } from './artifact-path.ts';
import { artifactCreatorSchema, artifactMetadataSchema } from './artifacts.ts';

/** Drive browsing, bulk listing, and moves over shared-artifact paths (specs/artifact-drive.md). */
const id = z.string().trim().min(1).max(128);
export const artifactListPageMax = 200;

/**
 * Lists one folder (`prefix`, `''` for the root). By default it returns the folder's immediate
 * child folders (first page only) and its own files; `recursive` returns every file under the
 * prefix instead, with no folders. `creator`, `kind`, and `query` filter files, and folder counts
 * reflect the same filters.
 */
export const artifactListInputSchema = z
    .object({
        creator: artifactCreatorSchema.optional(),
        kind: z.enum(['all', 'images', 'documents', 'media', 'other']).default('all'),
        limit: z.number().int().min(1).max(artifactListPageMax).default(50),
        offset: z.number().int().min(0).max(100_000).default(0),
        /** `updated`: newest revision first. `path`: stable path order for bulk pulls. */
        order: z.enum(['updated', 'path']).default('updated'),
        prefix: artifactFolderSchema.default(''),
        query: z.string().trim().max(200).default(''),
        recursive: z.boolean().default(false),
        serverId: id,
    })
    .strict();
export type ArtifactListInput = z.infer<typeof artifactListInputSchema>;
export type ArtifactListFilters = Omit<ArtifactListInput, 'serverId'>;

/** A folder exists only while some live file sits under it. */
export const artifactFolderEntrySchema = z
    .object({
        /** Live files anywhere under the folder that match the list filters. */
        file_count: z.number().int().positive(),
        name: z.string(),
        path: z.string(),
        /** The newest current revision under the folder. */
        updated_at: z.string(),
    })
    .strict();
export type ArtifactFolderEntry = z.infer<typeof artifactFolderEntrySchema>;
export const artifactListResultSchema = z
    .object({
        artifacts: z.array(artifactMetadataSchema),
        folders: z.array(artifactFolderEntrySchema),
        /** Offset of the next file page, or null on the last page. */
        next_offset: z.number().int().nonnegative().nullable(),
    })
    .strict();
export type ArtifactListResult = z.infer<typeof artifactListResultSchema>;

/**
 * Moves one file, or every file under a folder prefix, to a free destination in one
 * transaction. Only paths change. `base_revision_id` optionally guards a single-file move.
 */
export const artifactMoveInputSchema = z
    .object({
        base_revision_id: id.optional(),
        from: artifactPathSchema,
        serverId: id,
        to: artifactPathSchema,
    })
    .strict();
export type ArtifactMoveInput = z.infer<typeof artifactMoveInputSchema>;
export const artifactMoveResultSchema = z
    .object({
        from: z.string(),
        kind: z.enum(['file', 'folder']),
        moved_count: z.number().int().positive(),
        /** The destination as stored, after adopting existing folder casing. */
        to: z.string(),
    })
    .strict();
export type ArtifactMoveResult = z.infer<typeof artifactMoveResultSchema>;

/** Exact path lookup; the Agent route behind `haus artifact` path commands. */
export const artifactResolveInputSchema = z
    .object({ path: artifactPathSchema, serverId: id })
    .strict();

/** Machine-readable artifact failure codes shared by the Agent API and tRPC error data. */
export const artifactErrorCodeSchema = z.enum([
    'INVALID_ARG',
    'INVALID_PATH',
    'NOT_FOUND',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'REVISION_CONFLICT',
    'PATH_TAKEN',
    'PATH_CONFLICT',
    'IDEMPOTENCY_KEY_REUSED',
    'UPLOAD_CONFLICT',
    'DELETED',
    'CURRENT_REVISION',
    'CONTENT_TYPE',
    'SIZE_LIMIT',
    'STORAGE_LIMIT',
    'STORAGE_UNAVAILABLE',
    'AUTH_UNAVAILABLE',
]);
export type ArtifactErrorCode = z.infer<typeof artifactErrorCodeSchema>;

/**
 * The 409 body of a stale write: `current` is the live head the write lost to (the artifact
 * `base_revision_id` belongs to, wherever it now lives), or null when nothing has published yet.
 */
export const artifactRevisionConflictSchema = z
    .object({
        code: z.literal('REVISION_CONFLICT'),
        current: artifactMetadataSchema.nullable(),
        message: z.string(),
    })
    .strict();
export type ArtifactRevisionConflict = z.infer<typeof artifactRevisionConflictSchema>;
/** Artifact failure details tRPC errors carry as `data.artifact`. */
export const artifactErrorDataSchema = z
    .object({ code: artifactErrorCodeSchema, current: artifactMetadataSchema.nullable() })
    .strict();
export type ArtifactErrorData = z.infer<typeof artifactErrorDataSchema>;
