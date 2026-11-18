import type {
    ImageGenerationModel,
    ImageGenerationProvider,
    ImageGenerationProviderStatus,
} from '@haus/api';
import { formatImageGenerationCost } from '../../image-generation/image-generation-presentation.ts';

export const providerNames: Record<ImageGenerationProvider, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
};

export type KeyAction = 'add' | 'remove' | 'replace';

/** The key actions a provider's menu offers: add while disconnected, replace and remove once connected. */
export function providerKeyActions(status: Pick<ImageGenerationProviderStatus, 'connected'>) {
    return status.connected ? (['replace', 'remove'] as const) : (['add'] as const);
}

export const keyActionLabels: Record<KeyAction, string> = {
    add: 'Add key',
    remove: 'Remove key',
    replace: 'Replace key',
};

/** "$0.034 to $0.113" across a model's estimates, or one figure when they agree. Always an estimate. */
export function modelPriceRange(model: Pick<ImageGenerationModel, 'priceEstimates'>): string {
    const prices = model.priceEstimates.map((estimate) => estimate.usd);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const format = (usd: number) => formatImageGenerationCost({ basis: 'usage', usd });
    return low === high ? `About ${format(low)}` : `About ${format(low)} to ${format(high)}`;
}
