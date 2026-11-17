import {
    heartbeatLearnedResponseSchema,
    heartbeatReportResponseSchema,
    leadClaimConflictSchema,
    leadClaimedSchema,
    leadSchema,
} from '@haus/api';
import * as z from 'zod';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` heartbeat and lead
 * schemas, loosened at every nested object so an older Computer tolerates a
 * field a newer Server added instead of rejecting the whole response.
 */

export const heartbeatReportResultResponseSchema = z.looseObject(
    heartbeatReportResponseSchema.shape
);

export const heartbeatLearnedResultResponseSchema = z.looseObject(
    heartbeatLearnedResponseSchema.shape
);

const leadResponseSchema = z.looseObject(leadSchema.shape);

export const leadListResultResponseSchema = z.looseObject({
    leads: z.array(leadResponseSchema),
});

export const leadClaimResultResponseSchema = z.discriminatedUnion('claimed', [
    z.looseObject({ ...leadClaimedSchema.shape, lead: leadResponseSchema }),
    z.looseObject({
        ...leadClaimConflictSchema.shape,
        heldBy: z.looseObject(leadClaimConflictSchema.shape.heldBy.shape),
    }),
]);
