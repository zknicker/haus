import { expect, test } from 'bun:test';
import { failedResult, imageGenerationFixture, readyResult } from './image-generation-fixture.ts';
import {
    formatElapsed,
    formatImageGenerationCost,
    imageGenerationAspect,
    imageGenerationFilename,
    imageGenerationFooter,
} from './image-generation-presentation.ts';

const now = Date.parse('2026-10-13T12:00:12.000Z');

test('cost shows cents from a dime up, a third digit below, and ~ for estimates', () => {
    expect(formatImageGenerationCost({ basis: 'usage', usd: 0.11 })).toBe('$0.11');
    expect(formatImageGenerationCost({ basis: 'estimate', usd: 0.134 })).toBe('~$0.13');
    expect(formatImageGenerationCost({ basis: 'usage', usd: 0.034 })).toBe('$0.034');
    expect(formatImageGenerationCost({ basis: 'usage', usd: 0.05 })).toBe('$0.05');
});

test('elapsed reads seconds, then minutes and padded seconds', () => {
    expect(formatElapsed(12_400)).toBe('12s');
    expect(formatElapsed(65_000)).toBe('1m 05s');
});

test('a generating card names the model and ticks elapsed time', () => {
    const footer = imageGenerationFooter(imageGenerationFixture(), now);
    expect(footer).toMatchObject({
        facts: '12s',
        live: true,
        model: 'GPT Image 2.5 Sunburst',
        status: 'generating',
    });
});

test('a ready card shows resolution and cost, with ~ on an estimate', () => {
    const ready = imageGenerationFixture({ result: readyResult });
    expect(imageGenerationFooter(ready, now).facts).toBe('2K · $0.11');
    const estimated = imageGenerationFixture({
        result: { ...readyResult, cost: { basis: 'estimate', usd: 0.11 } },
    });
    expect(imageGenerationFooter(estimated, now).facts).toBe('2K · ~$0.11');
});

test('a failed card says no charge unless the provider billed it', () => {
    const free = imageGenerationFooter(imageGenerationFixture({ result: failedResult }), now);
    expect(free).toMatchObject({ facts: 'no charge', status: 'failed', tone: 'danger' });
    const billed = imageGenerationFooter(
        imageGenerationFixture({
            result: { ...failedResult, cost: { basis: 'usage', usd: 0.05 } },
        }),
        now
    );
    expect(billed.facts).toBe('$0.05');
});

test('aspect follows the request until the render lands, then the rendered pixels', () => {
    expect(imageGenerationAspect(imageGenerationFixture())).toBeCloseTo(16 / 9);
    const ready = imageGenerationFixture({ result: { ...readyResult, height: 1000, width: 1000 } });
    expect(imageGenerationAspect(ready)).toBe(1);
});

test('the save name carries the extension the bytes have', () => {
    const generation = imageGenerationFixture();
    expect(imageGenerationFilename(generation)).toBe('img_1.png');
    expect(imageGenerationFilename(generation, 'image/jpeg')).toBe('img_1.jpg');
    expect(imageGenerationFilename(generation, 'image/webp')).toBe('img_1.webp');
});
