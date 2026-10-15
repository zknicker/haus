import * as z from 'zod';
import { artifactFolderSchema, artifactPathSchema } from './artifact-path.ts';

/**
 * Batched Files actions over a selection (specs/artifact-drive.md, "Batches"): one move, one
 * delete, or one zip download per request, however many items the selection holds.
 */
const id = z.string().trim().min(1).max(128);

/** The most items one batched move, delete, or zip request may name. */
export const artifactBatchMaxItems = 1000;
/**
 * The most bytes one zip download streams. Zips are written without ZIP64, so the archive must
 * stay under 4 GiB including its headers; 4 GB leaves room for the largest allowed entry count.
 */
export const artifactZipMaxBytes = 4_000_000_000;
/** The most files one zip download holds. */
export const artifactZipMaxFiles = 10_000;
/** How long a zip download link works after it is issued. */
export const artifactZipLinkSeconds = 300;

/**
 * Moves files and folders into one destination folder, keeping each item's name, in one
 * transaction: every item moves or none does. An item already in the folder is left alone. A
 * file may carry its head as `base_revision_id`.
 */
export const artifactMoveManyInputSchema = z
    .object({
        items: z
            .array(z.object({ base_revision_id: id.optional(), path: artifactPathSchema }).strict())
            .min(1)
            .max(artifactBatchMaxItems),
        serverId: id,
        to_folder: artifactFolderSchema,
    })
    .strict();
export type ArtifactMoveManyInput = z.infer<typeof artifactMoveManyInputSchema>;
export const artifactMoveManyResultSchema = z
    .object({
        /** Files whose path changed, counting every file under a moved folder. */
        moved_count: z.number().int().nonnegative(),
        /** One entry per requested item, in request order; unchanged items have `from === to`. */
        items: z.array(
            z
                .object({ from: z.string(), kind: z.enum(['file', 'folder']), to: z.string() })
                .strict()
        ),
    })
    .strict();
export type ArtifactMoveManyResult = z.infer<typeof artifactMoveManyResultSchema>;

/**
 * Deletes the named files the caller may delete (their creator, or a human Owner/Admin) in one
 * transaction, and reports the rest: `forbidden` ones stay, `missing` ones were already gone.
 */
export const artifactDeleteManyInputSchema = z
    .object({
        artifact_ids: z.array(id).min(1).max(artifactBatchMaxItems),
        serverId: id,
    })
    .strict();
export type ArtifactDeleteManyInput = z.infer<typeof artifactDeleteManyInputSchema>;
export const artifactDeleteManyResultSchema = z
    .object({
        deleted: z.array(z.string()),
        forbidden: z.array(z.string()),
        missing: z.array(z.string()),
    })
    .strict();
export type ArtifactDeleteManyResult = z.infer<typeof artifactDeleteManyResultSchema>;

/**
 * A zip of files and folders under one `root` folder. Each entry is named by its path relative
 * to `root`, so a folder keeps its structure. Every path must sit inside `root`.
 */
export const artifactZipInputSchema = z
    .object({
        paths: z.array(artifactPathSchema).min(1).max(artifactBatchMaxItems),
        root: artifactFolderSchema,
        serverId: id,
    })
    .strict();
export type ArtifactZipInput = z.infer<typeof artifactZipInputSchema>;
export const artifactZipResultSchema = z
    .object({
        expires_at: z.string(),
        file_count: z.number().int().positive(),
        /** The archive's download name. */
        filename: z.string(),
        total_bytes: z.number().int().nonnegative(),
        /** Server-relative link (`/artifacts/zip/<token>`) that streams the archive once opened. */
        zip_path: z.string(),
    })
    .strict();
export type ArtifactZipResult = z.infer<typeof artifactZipResultSchema>;
