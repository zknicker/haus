import {
    driveAreaIdSchema,
    driveChangeSchema,
    driveConflictFileSchema,
    driveConflictReasonSchema,
} from '@haus/api';
import * as z from 'zod';

const [putChange, deleteChange] = driveChangeSchema.options;

export const driveChangesResponseSchema = z.looseObject({
    areas: z.array(z.looseObject({ area: driveAreaIdSchema, root: z.string().min(1) })),
    changes: z.array(
        z.discriminatedUnion('change', [
            z.looseObject(putChange.shape),
            z.looseObject(deleteChange.shape),
        ])
    ),
    complete: z.boolean(),
    until: z.record(driveAreaIdSchema, z.number().int().nonnegative()),
});
export type DriveChangesPage = z.infer<typeof driveChangesResponseSchema>;
export type DriveChangeEntry = DriveChangesPage['changes'][number];

const revision = z.looseObject({
    artifact_id: z.string().min(1),
    path: z.string(),
    revision_id: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    size_bytes: z.number().int().nonnegative(),
});
export type DriveRevisionFacts = z.infer<typeof revision>;

export const drivePushOutcomeResponseSchema = z.discriminatedUnion('outcome', [
    z.looseObject({
        current: revision,
        outcome: z.enum(['committed', 'merged', 'unchanged']),
        path: z.string(),
    }),
    z.looseObject({
        current: revision.nullable(),
        outcome: z.literal('deleted'),
        path: z.string(),
    }),
    z.looseObject({
        copy: revision,
        current: revision.nullable(),
        outcome: z.literal('kept_both'),
        path: z.string(),
        reason: driveConflictReasonSchema,
    }),
    z.looseObject({ current: revision, outcome: z.literal('kept_edit'), path: z.string() }),
    z.looseObject({
        code: z.string(),
        current: revision.nullable(),
        message: z.string(),
        outcome: z.literal('refused'),
        path: z.string(),
    }),
]);
export type DrivePushOutcomeEntry = z.infer<typeof drivePushOutcomeResponseSchema>;

export const drivePushCloseResponseSchema = z.looseObject({
    listed: z.array(z.looseObject(driveConflictFileSchema.shape)),
});

export const driveDownloadResponseSchema = z.looseObject({ download_url: z.string().url() });

export const driveErrorResponseSchema = z.looseObject({
    code: z.string().optional(),
    error: z.string().optional(),
    message: z.string().optional(),
});

export const driveHeadResponseSchema = z.looseObject({ artifact: revision });
