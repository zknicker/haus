import * as z from 'zod';

const id = z.string().trim().min(1).max(128);
export const artifactNameMaxLength = 128;
/** Server-scoped artifact name: lowercase-kebab, no extension. */
export const artifactNameSchema = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .max(artifactNameMaxLength);
/**
 * Publishing creates a new artifact unless `artifact_id` names one to revise. An explicit `name`
 * must be free; with neither, the Server derives a free name from `filename`.
 */
export const artifactPublishInputSchema = z
    .object({
        artifact_id: id.optional(),
        content_type: z
            .string()
            .trim()
            .max(255)
            .regex(/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/u)
            .default('application/octet-stream'),
        filename: z
            .string()
            .trim()
            .min(1)
            .max(255)
            .regex(/^[^/\\\u0000-\u001f\u007f]+$/u),
        name: artifactNameSchema.optional(),
        request_id: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
        title: z.string().trim().min(1).max(255),
    })
    .strict()
    .refine((value) => !(value.name && value.artifact_id), {
        message: 'Supply name or artifact_id, not both.',
    });
export type ArtifactPublishInput = z.infer<typeof artifactPublishInputSchema>;
/**
 * The artifact name a filename implies: its stem, lowercased, with runs of other characters
 * folded to single hyphens. Returns `artifact` when nothing usable remains.
 */
export function artifactNameFromFilename(filename: string, maxLength = artifactNameMaxLength) {
    const lastDot = filename.lastIndexOf('.');
    const stem = lastDot > 0 ? filename.slice(0, lastDot) : filename;
    const name = stem
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .slice(0, maxLength)
        .replace(/^-+|-+$/gu, '');
    return name || 'artifact';
}
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
/** Who created the artifact (its first revision). Exactly one Agent or one Server member. */
export const artifactCreatorSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('agent'), agent_id: id }).strict(),
    z.object({ type: z.literal('user'), user_id: id }).strict(),
]);
export type ArtifactCreator = z.infer<typeof artifactCreatorSchema>;
export const artifactListInputSchema = z
    .object({
        creator: artifactCreatorSchema.optional(),
        query: z.string().trim().max(200).default(''),
        kind: z.enum(['all', 'images', 'documents', 'media', 'other']).default('all'),
        offset: z.number().int().min(0).max(100_000).default(0),
        serverId: id,
    })
    .strict();
export type ArtifactListInput = z.infer<typeof artifactListInputSchema>;
export const artifactMetadataSchema = z
    .object({
        artifact_id: id,
        content_type: z.string(),
        /** When the artifact identity was created (its first publish). */
        created_at: z.string(),
        creator: artifactCreatorSchema,
        filename: z.string(),
        name: z.string(),
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
export const artifactListResultSchema = z
    .object({ artifacts: z.array(artifactMetadataSchema) })
    .strict();
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
