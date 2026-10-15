import * as z from 'zod';
import { artifactListResultSchema } from './artifact-drive.ts';
import { artifactCreatorSchema, artifactRecordSchema } from './artifacts.ts';

/**
 * Public links (specs/artifact-public-links.md): an opt-in, unguessable `/f/<token>` URL that
 * serves a file's current revision to anyone, outside Server membership.
 */
const id = z.string().trim().min(1).max(128);

/** 24 random bytes in base64url: 192 bits, unrelated to any id. */
export const artifactPublicTokenPattern = /^[A-Za-z0-9_-]{32}$/u;

export const artifactPublicLinkSchema = z
    .object({
        created_at: z.string(),
        /** Who created the link, not the file. */
        creator: artifactCreatorSchema,
        /** Whether the caller may disable it: the link's creator or a human Owner/Admin. */
        can_disable: z.boolean(),
        url: z.string().url(),
    })
    .strict();
export type ArtifactPublicLink = z.infer<typeof artifactPublicLinkSchema>;

export const artifactPublicLinkInputSchema = z.object({ artifact_id: id, serverId: id }).strict();
export const artifactPublicLinkResultSchema = z
    .object({ artifact_id: id, link: artifactPublicLinkSchema.nullable() })
    .strict();
export type ArtifactPublicLinkResult = z.infer<typeof artifactPublicLinkResultSchema>;

/**
 * The App's library page: `artifact.list` with App records (revision author, image facts) plus
 * the public links of the page's files.
 */
export const artifactLibraryPageSchema = artifactListResultSchema
    .extend({
        artifacts: z.array(artifactRecordSchema),
        public_links: z.record(z.string(), artifactPublicLinkSchema),
    })
    .strict();
export type ArtifactLibraryPage = z.infer<typeof artifactLibraryPageSchema>;
