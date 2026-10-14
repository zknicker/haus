import * as z from 'zod';

/** The registry's providers. A provider is available on a Server only while its Owner-supplied key is stored. */
export const imageGenerationProviders = ['openai', 'gemini'] as const;
export const imageGenerationProviderSchema = z.enum(imageGenerationProviders);
export type ImageGenerationProvider = z.infer<typeof imageGenerationProviderSchema>;

/** Resolution classes, read from the rendered long edge. */
export const imageGenerationResolutions = ['1K', '2K', '4K'] as const;
export const imageGenerationResolutionSchema = z.enum(imageGenerationResolutions);
export type ImageGenerationResolution = z.infer<typeof imageGenerationResolutionSchema>;

export const imageGenerationBackgrounds = ['opaque', 'transparent'] as const;
export const imageGenerationBackgroundSchema = z.enum(imageGenerationBackgrounds);
export type ImageGenerationBackground = z.infer<typeof imageGenerationBackgroundSchema>;

/** A real registry id such as `gemini-nano-banana-2.1`. There are no provider or tier aliases. */
export const imageGenerationModelIdSchema = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/u);

export const imageGenerationAspectSchema = z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{1,2}$/u, 'An aspect reads as W:H.');

export const imageGenerationSizeSchema = z
    .object({
        height: z.number().int().positive().max(8192),
        width: z.number().int().positive().max(8192),
    })
    .strict();
export type ImageGenerationSize = z.infer<typeof imageGenerationSizeSchema>;

/**
 * How a model takes its size. `exact-pixels` (OpenAI): both edges multiples of
 * `multipleOf`, long:short ratio at most `maxRatio`, longest edge at most
 * `maxEdge`; above `experimentalAbovePixels` total pixels the provider calls
 * the output experimental. `aspect-resolution` (Gemini): one listed aspect plus
 * one listed resolution.
 */
export const imageGenerationSizingSchema = z.discriminatedUnion('kind', [
    z
        .object({
            experimentalAbovePixels: z.number().int().positive().nullable(),
            kind: z.literal('exact-pixels'),
            maxEdge: z.number().int().positive(),
            maxRatio: z.number().positive(),
            multipleOf: z.number().int().positive(),
        })
        .strict(),
    z
        .object({
            aspects: z.array(imageGenerationAspectSchema).min(1),
            kind: z.literal('aspect-resolution'),
            resolutions: z.array(imageGenerationResolutionSchema).min(1),
        })
        .strict(),
]);
export type ImageGenerationSizing = z.infer<typeof imageGenerationSizingSchema>;

/** One registry price estimate, per resolution and quality where the model prices by them. */
export const imageGenerationPriceEstimateSchema = z
    .object({
        quality: z.string().trim().min(1).max(40).nullable(),
        resolution: imageGenerationResolutionSchema.nullable(),
        usd: z.number().nonnegative(),
    })
    .strict();
export type ImageGenerationPriceEstimate = z.infer<typeof imageGenerationPriceEstimateSchema>;

/** One curated model as `haus image models` and the Settings list describe it. */
export const imageGenerationModelSchema = z
    .object({
        displayName: z.string().trim().min(1).max(80),
        id: imageGenerationModelIdSchema,
        /** Whether this model is the registry default. Exactly one model is. */
        isDefault: z.boolean(),
        /** Reference images a request may carry; 0 means the model takes none. */
        maxReferences: z.number().int().nonnegative(),
        /** Estimates, labeled as such wherever shown. */
        priceEstimates: z.array(imageGenerationPriceEstimateSchema).min(1),
        provider: imageGenerationProviderSchema,
        qualityLevels: z.array(z.string().trim().min(1).max(40)),
        sizing: imageGenerationSizingSchema,
        /** What the model is good at, one or two plain sentences. */
        strengths: z.string().trim().min(1).max(300),
        supportsTransparency: z.boolean(),
    })
    .strict();
export type ImageGenerationModel = z.infer<typeof imageGenerationModelSchema>;

/**
 * Why a model cannot be used on this Server right now. `no-key`: the Server
 * Owner has not added the provider's API key in Settings.
 */
export const imageGenerationUnavailableReasons = ['no-key'] as const;
export const imageGenerationUnavailableReasonSchema = z.enum(imageGenerationUnavailableReasons);
export type ImageGenerationUnavailableReason = z.infer<
    typeof imageGenerationUnavailableReasonSchema
>;

/** A registry model plus whether this Server can use it. */
export const imageGenerationModelStatusSchema = z
    .object({
        available: z.boolean(),
        model: imageGenerationModelSchema,
        unavailableReason: imageGenerationUnavailableReasonSchema.nullable(),
    })
    .strict()
    .refine((value) => value.available !== Boolean(value.unavailableReason), {
        message: 'An available model carries no reason, and an unavailable one names its reason.',
        path: ['unavailableReason'],
    });
export type ImageGenerationModelStatus = z.infer<typeof imageGenerationModelStatusSchema>;
