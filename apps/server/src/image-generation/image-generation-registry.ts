import {
    type ImageGenerationModel,
    type ImageGenerationModelStatus,
    type ImageGenerationPriceEstimate,
    type ImageGenerationProvider,
    type ImageGenerationResolution,
    imageGenerationModelSchema,
} from '@haus/api';

const geminiBaseAspects = ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const gptSizing = {
    experimentalAbovePixels: 2560 * 1440,
    kind: 'exact-pixels',
    maxEdge: 3840,
    maxRatio: 3,
    multipleOf: 16,
} as const;
/** `auto` is the provider default; it and the unpriced top levels are estimated from a priced row. */
const gptQualityLevels = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'];
const pricedQualityFor: Record<string, 'high' | 'medium'> = {
    auto: 'medium',
    max: 'high',
    xhigh: 'high',
};
const resolutions = ['1K', '2K', '4K'] as const;

/**
 * The curated registry (specs/image-generation.md, "Model registry"): one model
 * per job per provider and no superseded models. Adding or removing a model is
 * a change here only. Prices are estimates; OpenAI models are billed from the
 * provider's reported usage when it is present.
 */
const registry: readonly ImageGenerationModel[] = [
    {
        displayName: 'Nano Banana 2.1',
        id: 'gemini-nano-banana-2.1',
        isDefault: true,
        maxReferences: 14,
        priceEstimates: geminiPrices([0.034, 0.05, 0.113]),
        provider: 'gemini',
        qualityLevels: [],
        sizing: {
            aspects: [...geminiBaseAspects, '1:4', '4:1', '1:8', '8:1'],
            kind: 'aspect-resolution',
            resolutions: [...resolutions],
        },
        strengths: 'Everyday renders at a good price. The default.',
        supportsTransparency: false,
    },
    {
        displayName: 'Nano Banana Pro',
        id: 'gemini-3-pro-image',
        isDefault: false,
        maxReferences: 14,
        priceEstimates: geminiPrices([0.134, 0.134, 0.24]),
        provider: 'gemini',
        qualityLevels: [],
        sizing: {
            aspects: geminiBaseAspects,
            kind: 'aspect-resolution',
            resolutions: [...resolutions],
        },
        strengths: 'Hard spelling and complex layouts.',
        supportsTransparency: false,
    },
    {
        displayName: 'GPT Image 2.5 Flare',
        id: 'gpt-image-2.5-flare',
        isDefault: false,
        // The OpenAI edits endpoint takes up to 16 input images, on Flare as on Sunburst.
        maxReferences: 16,
        priceEstimates: gptPrices({
            high: [0.07, 0.17, 0.4],
            low: [0.005, 0.012, 0.03],
            medium: [0.02, 0.05, 0.12],
        }),
        provider: 'openai',
        qualityLevels: gptQualityLevels,
        sizing: gptSizing,
        strengths: 'Fast everyday renders at exact pixel sizes.',
        supportsTransparency: true,
    },
    {
        displayName: 'GPT Image 2.5 Sunburst',
        id: 'gpt-image-2.5-sunburst',
        isDefault: false,
        maxReferences: 16,
        priceEstimates: gptPrices({
            high: [0.15, 0.4, 0.95],
            low: [0.01, 0.03, 0.07],
            medium: [0.04, 0.11, 0.27],
        }),
        provider: 'openai',
        qualityLevels: gptQualityLevels,
        sizing: gptSizing,
        strengths: 'Best text rendering and edit fidelity.',
        supportsTransparency: true,
    },
].map((model) => imageGenerationModelSchema.parse(model));

export const imageGenerationRegistry: readonly ImageGenerationModel[] = registry;

export function findImageGenerationModel(modelId: string): ImageGenerationModel | undefined {
    return registry.find((model) => model.id === modelId);
}

export function imageGenerationModelsFor(provider: ImageGenerationProvider) {
    return registry.filter((model) => model.provider === provider);
}

/** The registry with each model's availability, given the providers that have a key. */
export function imageGenerationModelStatuses(
    connected: ReadonlySet<ImageGenerationProvider>
): ImageGenerationModelStatus[] {
    return registry.map((model) =>
        connected.has(model.provider)
            ? { available: true, model, unavailableReason: null }
            : { available: false, model, unavailableReason: 'no-key' }
    );
}

/**
 * The registry price estimate for a request: the entry matching the resolution
 * class and, for models priced by quality, the quality. Levels with no price
 * row price as a neighbor: `xhigh` and `max` as `high`, `auto` and no quality
 * as `medium`.
 */
export function estimateImageGenerationUsd(
    model: ImageGenerationModel,
    input: { quality: string | null; resolution: ImageGenerationResolution }
): number {
    const requested = input.quality ?? 'auto';
    const quality =
        model.qualityLevels.length > 0 ? (pricedQualityFor[requested] ?? requested) : null;
    const match =
        model.priceEstimates.find(
            (estimate) => estimate.resolution === input.resolution && estimate.quality === quality
        ) ?? model.priceEstimates.find((estimate) => estimate.resolution === input.resolution);
    return (match ?? model.priceEstimates[0]).usd;
}

function geminiPrices(usd: [number, number, number]): ImageGenerationPriceEstimate[] {
    return resolutions.map((resolution, index) => ({
        quality: null,
        resolution,
        usd: usd[index],
    }));
}

function gptPrices(
    byQuality: Record<'high' | 'low' | 'medium', [number, number, number]>
): ImageGenerationPriceEstimate[] {
    return (['low', 'medium', 'high'] as const).flatMap((quality) =>
        resolutions.map((resolution, index) => ({
            quality,
            resolution,
            usd: byQuality[quality][index],
        }))
    );
}
