import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import {
    imageGenerationModelSchema,
    imageGenerationProviderSchema,
} from './image-generation-models.ts';

/** Owner-only reads and writes of the Server's image provider keys. No schema here ever returns a key. */
export const imageGenerationSettingsGetInputSchema = z.object({ serverId: idSchema }).strict();

/** One provider's status. `updatedAt` is when its key last changed; null while not connected. */
export const imageGenerationProviderStatusSchema = z
    .object({
        connected: z.boolean(),
        models: z.array(imageGenerationModelSchema),
        provider: imageGenerationProviderSchema,
        updatedAt: timestampSchema.nullable(),
    })
    .strict();
export type ImageGenerationProviderStatus = z.infer<typeof imageGenerationProviderStatusSchema>;

/** Every provider, in registry order. */
export const imageGenerationSettingsSchema = z
    .object({ providers: z.array(imageGenerationProviderStatusSchema) })
    .strict();
export type ImageGenerationSettings = z.infer<typeof imageGenerationSettingsSchema>;

export const imageGenerationProviderKeySchema = z.string().trim().min(8).max(500);

/** Adds or replaces the provider's key. Returns that provider's new status. */
export const imageGenerationKeySetInputSchema = z
    .object({
        apiKey: imageGenerationProviderKeySchema,
        provider: imageGenerationProviderSchema,
        serverId: idSchema,
    })
    .strict();
export type ImageGenerationKeySetInput = z.infer<typeof imageGenerationKeySetInputSchema>;

export const imageGenerationKeyRemoveInputSchema = z
    .object({ provider: imageGenerationProviderSchema, serverId: idSchema })
    .strict();
export type ImageGenerationKeyRemoveInput = z.infer<typeof imageGenerationKeyRemoveInputSchema>;
