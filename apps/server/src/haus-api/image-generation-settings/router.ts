import {
    imageGenerationKeyRemoveInputSchema,
    imageGenerationKeySetInputSchema,
    imageGenerationProviderStatusSchema,
    imageGenerationSettingsGetInputSchema,
    imageGenerationSettingsSchema,
} from '@haus/api';
import { TRPCError } from '@trpc/server';
import { ImageGenerationSettingsDeniedError } from '../../image-generation/image-generation-errors.ts';
import {
    readImageGenerationSettings,
    removeImageGenerationKey,
    setImageGenerationKey,
} from '../../image-generation/image-generation-keys.ts';
import { memberProcedure } from '../server/procedure.ts';
import { createRouter } from '../trpc.ts';

const ownerOnly = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (!result.ok && result.error.cause instanceof ImageGenerationSettingsDeniedError) {
        throw new TRPCError({
            cause: result.error.cause,
            code: 'FORBIDDEN',
            message: result.error.cause.message,
        });
    }
    return result;
});

/**
 * The Server Owner's image provider keys. Reads return connection state and
 * the curated models a key unlocks; no procedure ever returns a key.
 */
export const imageGenerationSettingsRouter = createRouter({
    get: ownerOnly
        .input(imageGenerationSettingsGetInputSchema)
        .output(imageGenerationSettingsSchema)
        .query(({ ctx, input }) =>
            readImageGenerationSettings(ctx.hausDb, ctx.member, input.serverId)
        ),
    removeKey: ownerOnly
        .input(imageGenerationKeyRemoveInputSchema)
        .output(imageGenerationProviderStatusSchema)
        .mutation(({ ctx, input }) => removeImageGenerationKey(ctx.hausDb, ctx.member, input)),
    setKey: ownerOnly
        .input(imageGenerationKeySetInputSchema)
        .output(imageGenerationProviderStatusSchema)
        .mutation(({ ctx, input }) => setImageGenerationKey(ctx.hausDb, ctx.member, input)),
});
