import { expect, test } from 'bun:test';
import type { ImageGenerationModel } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageGenerationSettings } from './image-generation-group.tsx';
import { modelPriceRange, providerKeyActions } from './image-generation-settings-model.ts';

const priced = (usd: number[]): Pick<ImageGenerationModel, 'priceEstimates'> => ({
    priceEstimates: usd.map((value) => ({ quality: null, resolution: null, usd: value })),
});

test('a disconnected provider offers Add; a connected one offers Replace and Remove', () => {
    expect(providerKeyActions({ connected: false })).toEqual(['add']);
    expect(providerKeyActions({ connected: true })).toEqual(['replace', 'remove']);
});

test('a model price is a labeled estimate range', () => {
    expect(modelPriceRange(priced([0.034, 0.05, 0.113]))).toBe('About $0.034 to $0.11');
    expect(modelPriceRange(priced([0.134]))).toBe('About $0.13');
});

test('the section renders nothing for anyone but the Owner, and never reads for them', () => {
    // A non-Owner short-circuits before any query hook, so no provider is needed.
    expect(renderToStaticMarkup(<ImageGenerationSettings isOwner={false} serverId="srv_1" />)).toBe(
        ''
    );
});
