import type { ImageGenerationModel, ImageGenerationProvider } from '@haus/api';
import { formatImageGenerationCost } from '../../image-generation/image-generation-presentation.ts';

export const providerNames: Record<ImageGenerationProvider, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
};

export type KeyAction = 'add' | 'remove' | 'replace';

/** A provider without a key offers Add key as its one button; once connected, its menu holds these. */
export const connectedKeyActions = ['replace', 'remove'] as const satisfies readonly KeyAction[];

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
