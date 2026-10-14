import type {
    ImageGenerationCost,
    ImageGenerationModel,
    ImageGenerationRequest,
    ImageGenerationResolution,
} from '@haus/api';
import { estimateImageGenerationUsd } from './image-generation-registry.ts';
import type { ImageProviderUsage } from './providers/image-provider.ts';

/** OpenAI image token prices, USD per million tokens. */
const usdPerMillion = { imageInput: 8, imageOutput: 30, textInput: 5 } as const;

/**
 * Cost from provider-reported usage when present (`usage`), otherwise the
 * registry estimate for the rendered resolution class (`estimate`).
 */
export function costOfImageGeneration(input: {
    model: ImageGenerationModel;
    request: ImageGenerationRequest;
    resolution: ImageGenerationResolution;
    usage: ImageProviderUsage | null;
}): ImageGenerationCost {
    if (input.usage && input.model.provider === 'openai') {
        const usd =
            (input.usage.textInputTokens * usdPerMillion.textInput +
                input.usage.imageInputTokens * usdPerMillion.imageInput +
                input.usage.outputTokens * usdPerMillion.imageOutput) /
            1_000_000;
        return { basis: 'usage', usd: roundUsd(usd) };
    }
    return {
        basis: 'estimate',
        usd: estimateImageGenerationUsd(input.model, {
            quality: input.request.quality,
            resolution: input.resolution,
        }),
    };
}

function roundUsd(usd: number): number {
    return Math.round(usd * 1_000_000) / 1_000_000;
}
