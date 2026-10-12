import * as z from 'zod';

const id = z.string().trim().min(1).max(128);
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
        name: z
            .string()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
            .max(128)
            .optional(),
        request_id: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
        title: z.string().trim().min(1).max(255),
    })
    .strict()
    .refine((value) => Boolean(value.name) !== Boolean(value.artifact_id), {
        message: 'Supply exactly one of name or artifact_id.',
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
export const artifactListInputSchema = z
    .object({
        query: z.string().trim().max(200).default(''),
        kind: z.enum(['all', 'images', 'documents', 'media', 'other']).default('all'),
        offset: z.number().int().min(0).max(100_000).default(0),
        serverId: id,
    })
    .strict();
export const artifactMetadataSchema = z
    .object({
        artifact_id: id,
        content_type: z.string(),
        created_at: z.string(),
        filename: z.string(),
        name: z.string(),
        revision_id: id,
        revision_number: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        size_bytes: z.number().int().nonnegative(),
        stable_url: z.string(),
        title: z.string(),
        version_url: z.string(),
    })
    .strict();
export type ArtifactMetadata = z.infer<typeof artifactMetadataSchema>;
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
