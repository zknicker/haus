import { expect, test } from 'bun:test';
import { renderImageModels } from '../image-render.ts';
import type { ParsedArgs } from '../parse.ts';
import { IMAGE_SUBCOMMANDS, runImageModels } from './agent-image.ts';

const noArgs: ParsedArgs = {
    flags: {},
    help: false,
    positionals: [],
    valueLists: {},
    values: {},
};

const model = (overrides: Record<string, unknown> = {}) => ({
    displayName: 'GPT Image 2.5 Sunburst',
    id: 'gpt-image-2.5-sunburst',
    isDefault: false,
    maxReferences: 4,
    priceEstimates: [{ quality: 'high', resolution: '2K', usd: 0.11 }],
    provider: 'openai',
    qualityLevels: ['low', 'medium', 'high'],
    sizing: {
        experimentalAbovePixels: 3_686_400,
        kind: 'exact-pixels',
        maxEdge: 3840,
        maxRatio: 3,
        multipleOf: 16,
    },
    strengths: 'Best text and edit fidelity.',
    supportsTransparency: true,
    ...overrides,
});

test('models lists sizing, prices, and why a model is unavailable', async () => {
    const payload = {
        models: [
            { available: false, model: model(), unavailableReason: 'no-key' },
            {
                available: true,
                model: model({
                    displayName: 'Nano Banana 2.1',
                    id: 'gemini-nano-banana-2.1',
                    isDefault: true,
                    maxReferences: 0,
                    priceEstimates: [
                        { quality: null, resolution: '1K', usd: 0.034 },
                        { quality: null, resolution: '2K', usd: 0.05 },
                    ],
                    provider: 'gemini',
                    qualityLevels: [],
                    sizing: {
                        aspects: ['1:1', '16:9'],
                        kind: 'aspect-resolution',
                        resolutions: ['1K', '2K'],
                    },
                    supportsTransparency: false,
                }),
                unavailableReason: null,
            },
        ],
    };
    const out: string[] = [];
    await runImageModels(
        noArgs,
        { request: (_path, schema) => Promise.resolve(schema.parse(payload)) },
        (text) => out.push(text)
    );
    const text = out.join('');
    expect(text).toContain('GPT Image 2.5 Sunburst (gpt-image-2.5-sunburst)');
    expect(text).toContain(
        'unavailable: no key. The Server Owner adds an OpenAI key in Settings → Image generation.'
    );
    expect(text).toContain('Both edges multiples of 16');
    expect(text).toContain('Price estimate: high 2K ~$0.11'.replace('high 2K', '2K high'));
    expect(text).toContain('Nano Banana 2.1 (gemini-nano-banana-2.1) [default]');
    expect(text).toContain('Aspects: 1:1, 16:9. Resolutions: 1K, 2K.');
    expect(text).toContain('Price estimate: 1K ~$0.034; 2K ~$0.05');
    expect(text).toContain('References: not supported');
    expect(text).toContain('Transparent background: no');
    expect(renderImageModels([])).toBe('No image models are configured on this Server.\n');
});

test('the image family registers models, generate, and wait', () => {
    expect(IMAGE_SUBCOMMANDS.map((command) => command.name)).toEqual([
        'models',
        'generate',
        'wait',
    ]);
    const flags = IMAGE_SUBCOMMANDS[1]?.flags.map((flag) => flag.name);
    expect(flags).toContain('--reference');
    expect(flags).not.toContain('--target');
    expect(flags).not.toContain('--out');
    expect(IMAGE_SUBCOMMANDS[2]?.flags.map((flag) => flag.name)).toEqual(['--out', '--timeout']);
});
