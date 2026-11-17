import {
    artifactCreatorSchema,
    artifactDownloadResultSchema,
    artifactFolderEntrySchema,
    artifactListResultSchema,
    artifactListSummarySchema,
    artifactMetadataSchema,
    artifactMoveResultSchema,
} from '@haus/api';
import * as z from 'zod';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` artifact drive schemas,
 * loosened at every nested object so an older Computer tolerates a field a
 * newer Server added instead of rejecting the whole response. Those
 * canonical schemas stay strict for the Server's own construction and for
 * validating untrusted request input; only response parsing needs this
 * tolerance.
 */

const [agentCreator, userCreator] = artifactCreatorSchema.options;

const artifactCreatorResponseSchema = z.discriminatedUnion('type', [
    z.looseObject(agentCreator.shape),
    z.looseObject(userCreator.shape),
]);

export const artifactMetadataResponseSchema = z.looseObject({
    ...artifactMetadataSchema.shape,
    creator: artifactCreatorResponseSchema,
});

const artifactFolderEntryResponseSchema = z.looseObject(artifactFolderEntrySchema.shape);
const artifactListSummaryResponseSchema = z.looseObject(artifactListSummarySchema.shape);

export const artifactListResultResponseSchema = z.looseObject({
    ...artifactListResultSchema.shape,
    artifacts: z.array(artifactMetadataResponseSchema),
    folders: z.array(artifactFolderEntryResponseSchema),
    summary: artifactListSummaryResponseSchema,
});

export const artifactPublishResultResponseSchema = z.looseObject({
    artifact: artifactMetadataResponseSchema,
});

export const artifactVersionsResultResponseSchema = z.looseObject({
    versions: z.array(artifactMetadataResponseSchema),
});

export const artifactMoveResultResponseSchema = z.looseObject(artifactMoveResultSchema.shape);

export const artifactDownloadResultResponseSchema = z.looseObject({
    ...artifactDownloadResultSchema.shape,
    artifact: artifactMetadataResponseSchema,
});
