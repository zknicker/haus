import * as z from 'zod';
import { artifactPathSchema } from './artifact-path.ts';

const id = z.string().trim().min(1).max(128);
/**
 * Writes address a drive `path`. A free path creates an artifact. An occupied path adds a
 * revision only when `base_revision_id` names its current head, or when `replace` deliberately
 * overwrites whatever the head is; otherwise the write fails with `REVISION_CONFLICT`.
 */
export const artifactPublishInputSchema = z
    .object({
        base_revision_id: id.optional(),
        content_type: z
            .string()
            .trim()
            .max(255)
            .regex(/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/u)
            .default('application/octet-stream'),
        path: artifactPathSchema,
        replace: z.boolean().default(false),
        request_id: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
        /** Defaults to the path's file name. */
        title: z.string().trim().min(1).max(255).optional(),
    })
    .strict()
    .refine((value) => !(value.base_revision_id && value.replace), {
        message: 'Supply base_revision_id or replace, not both.',
    });
export type ArtifactPublishInput = z.infer<typeof artifactPublishInputSchema>;
export const artifactTargetInputSchema = z
    .object({
        artifact_id: id,
        revision_id: id.optional(),
        offset: z.number().int().min(0).max(100_000).default(0),
        serverId: id,
    })
    .strict();
/** `save` signs the link to download as a file (`Content-Disposition: attachment`) instead of rendering inline. */
export const artifactDownloadInputSchema = artifactTargetInputSchema.extend({
    save: z.boolean().default(false),
});
/**
 * Days a replaced revision stays readable after a newer revision took its place. The current
 * revision of a file is always kept.
 */
export const ARTIFACT_REVISION_RETENTION_DAYS = 7;
/** Largest revision `artifact.text` decodes for an inline preview. */
export const artifactTextMaxBytes = 1_048_576;
/** Revisions are immutable, so a text read always names one. */
export const artifactTextInputSchema = z
    .object({ artifact_id: id, revision_id: id, serverId: id })
    .strict();
/** A revision's UTF-8 text, or why the App should offer a download instead. */
export const artifactTextResultSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('text'), text: z.string() }).strict(),
    z.object({ status: z.literal('too_large'), limit_bytes: z.number().int().positive() }).strict(),
    z.object({ status: z.literal('binary') }).strict(),
]);
export type ArtifactTextResult = z.infer<typeof artifactTextResultSchema>;
/** Thumbnails belong to one immutable revision. */
export const artifactThumbnailInputSchema = artifactTextInputSchema;
/**
 * A raster revision's WebP thumbnail (longest edge 1024 px) as a signed link, or `none` for
 * files without one (not a raster image, too large to read back, or bytes that do not decode).
 */
export const artifactThumbnailResultSchema = z.discriminatedUnion('status', [
    z
        .object({
            status: z.literal('ready'),
            thumbnail_url: z.string().url(),
            expires_at: z.string(),
        })
        .strict(),
    z.object({ status: z.literal('none') }).strict(),
]);
export type ArtifactThumbnailResult = z.infer<typeof artifactThumbnailResultSchema>;
/** Who created the artifact (its first revision). Exactly one Agent or one Server member. */
export const artifactCreatorSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('agent'), agent_id: id }).strict(),
    z.object({ type: z.literal('user'), user_id: id }).strict(),
]);
export type ArtifactCreator = z.infer<typeof artifactCreatorSchema>;
export const artifactMetadataSchema = z
    .object({
        artifact_id: id,
        content_type: z.string(),
        /** When the artifact identity was created (its first publish). */
        created_at: z.string(),
        creator: artifactCreatorSchema,
        /** The file name: the last segment of `path`. */
        filename: z.string(),
        /** Canonical drive path, unique among the Server's live artifacts. */
        path: z.string(),
        revision_id: id,
        revision_number: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        size_bytes: z.number().int().nonnegative(),
        stable_url: z.string(),
        title: z.string(),
        /** When this revision was published; for current metadata, the latest revision time. */
        updated_at: z.string(),
        version_url: z.string(),
    })
    .strict();
export type ArtifactMetadata = z.infer<typeof artifactMetadataSchema>;
/** A raster revision's pixel size, and its print density when the file records one (PNG `pHYs`). */
export const artifactImageFactsSchema = z
    .object({
        dpi: z.number().int().positive().nullable(),
        height: z.number().int().positive(),
        width: z.number().int().positive(),
    })
    .strict();
export type ArtifactImageFacts = z.infer<typeof artifactImageFactsSchema>;
/**
 * The App's view of one revision: the shared metadata plus who published this revision
 * (`author`, unlike `creator`, which made the file) and its image facts, null until measured or
 * for non-raster files. Agent routes keep `artifactMetadataSchema`, which deployed CLIs parse
 * strictly.
 */
export const artifactRecordSchema = artifactMetadataSchema
    .extend({ author: artifactCreatorSchema, image: artifactImageFactsSchema.nullable() })
    .strict();
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>;
export const artifactRecordResultSchema = z.object({ artifact: artifactRecordSchema }).strict();
export const artifactRecordVersionsResultSchema = z
    .object({ versions: z.array(artifactRecordSchema) })
    .strict();
/**
 * Restores an older revision by publishing its bytes, title, and content type as a new revision
 * on top of the current head. History is never rewritten.
 */
export const artifactRestoreInputSchema = z
    .object({ artifact_id: id, revision_id: id, serverId: id })
    .strict();
export const artifactCreatorsInputSchema = z.object({ serverId: id }).strict();
export const artifactCreatorSummarySchema = z
    .object({
        artifact_count: z.number().int().positive(),
        creator: artifactCreatorSchema,
        latest_at: z.string(),
        previews: z.array(artifactMetadataSchema).min(1).max(3),
    })
    .strict();
export type ArtifactCreatorSummary = z.infer<typeof artifactCreatorSummarySchema>;
export const artifactCreatorsResultSchema = z
    .object({ creators: z.array(artifactCreatorSummarySchema) })
    .strict();
export const artifactPublishResultSchema = z.object({ artifact: artifactMetadataSchema }).strict();
export const artifactVersionsResultSchema = z
    .object({ versions: z.array(artifactMetadataSchema) })
    .strict();
export const artifactDownloadResultSchema = z
    .object({
        artifact: artifactMetadataSchema,
        download_url: z.string().url(),
        expires_at: z.string(),
    })
    .strict();
