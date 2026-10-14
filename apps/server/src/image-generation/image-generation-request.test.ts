import { describe, expect, test } from 'bun:test';
import { agentImageGenerationCreateInputSchema } from '@haus/api';
import { costOfImageGeneration } from './image-generation-cost.ts';
import { findImageGenerationModel } from './image-generation-registry.ts';
import { resolveImageGenerationRequest } from './image-generation-request.ts';
import { renderedResolutionClass, resolutionClassOf } from './image-generation-sizing.ts';

function resolve(overrides: Record<string, unknown>) {
    return resolveImageGenerationRequest(
        agentImageGenerationCreateInputSchema.parse({
            model: 'gemini-nano-banana-2.1',
            nonce: 'n1',
            prompt: 'a fox',
            ...overrides,
        })
    );
}

describe('resolveImageGenerationRequest', () => {
    test('rejects a model that is not in the registry and lists the real ids', () => {
        expect(() => resolve({ model: 'gpt-image-2' })).toThrow(/gemini-nano-banana-2\.1/u);
    });

    test('defaults a Gemini request to 1:1 at 1K and an OpenAI request to 1024x1024', () => {
        expect(resolve({}).request).toMatchObject({
            aspect: '1:1',
            aspectRatio: { height: 1, width: 1 },
            resolution: '1K',
        });
        expect(resolve({ model: 'gpt-image-2.5-flare' }).request).toMatchObject({
            size: { height: 1024, width: 1024 },
        });
    });

    test('names the two nearest Gemini aspects for an inexact ratio', () => {
        expect(() => resolve({ aspect: '7:5' })).toThrow(/4:3 or 3:2/u);
    });

    test('rejects --size on Gemini, naming the nearest aspect and resolution', () => {
        expect(() => resolve({ size: { height: 1024, width: 1024 } })).toThrow(
            /--aspect 1:1 --resolution 1K/u
        );
        expect(() => resolve({ size: { height: 1152, width: 2048 } })).toThrow(
            /--aspect 16:9 --resolution 2K/u
        );
        expect(() => resolve({ size: { height: 700, width: 1000 } })).toThrow(
            /--aspect 3:2 --resolution 1K/u
        );
    });

    test('enforces the OpenAI total-pixel bounds with a nearest size', () => {
        expect(() =>
            resolve({ model: 'gpt-image-2.5-flare', size: { height: 1024, width: 512 } })
        ).toThrow(
            /total pixels must be between 655,360 and 8,294,400.*Nearest supported size: 576x1152/u
        );
        expect(() =>
            resolve({ model: 'gpt-image-2.5-flare', size: { height: 2400, width: 3840 } })
        ).toThrow(/Nearest supported size: 3648x2272/u);
        const { request } = resolve({
            model: 'gpt-image-2.5-flare',
            size: { height: 2160, width: 3840 },
        });
        expect(request.size).toEqual({ height: 2160, width: 3840 });
    });

    test('names the nearest renderable OpenAI size', () => {
        expect(() =>
            resolve({ model: 'gpt-image-2.5-flare', size: { height: 1000, width: 1001 } })
        ).toThrow(/Nearest supported size: 1008x1008/u);
        expect(() =>
            resolve({ model: 'gpt-image-2.5-flare', size: { height: 400, width: 4000 } })
        ).toThrow(/Nearest supported size: 3840x1280/u);
    });

    test('maps aspect plus resolution to exact OpenAI pixels only when exact', () => {
        const { request } = resolve({
            aspect: '16:9',
            model: 'gpt-image-2.5-sunburst',
            resolution: '2K',
        });
        expect(request.size).toEqual({ height: 1152, width: 2048 });
        expect(() =>
            resolve({ aspect: '3:2', model: 'gpt-image-2.5-sunburst', resolution: '1K' })
        ).toThrow(/Nearest supported size: 1024x688/u);
    });

    test('refuses options the model lacks', () => {
        expect(() => resolve({ quality: 'high' })).toThrow(/no quality levels/u);
        expect(() => resolve({ model: 'gpt-image-2.5-flare', quality: 'ultra' })).toThrow(
            /low, medium, high, xhigh, max, auto/u
        );
        expect(() => resolve({ background: 'transparent' })).toThrow(/gpt-image-2\.5-flare/u);
        expect(
            resolve({
                model: 'gpt-image-2.5-flare',
                referenceAttachmentIds: Array.from(
                    { length: 16 },
                    (_, i) => `att_${String(i).padStart(16, 'a')}`
                ),
            }).request.referenceAttachmentIds
        ).toHaveLength(16);
        expect(() =>
            resolve({
                referenceAttachmentIds: Array.from(
                    { length: 15 },
                    (_, i) => `att_${String(i).padStart(16, 'a')}`
                ),
            })
        ).toThrow(/at most 14/u);
    });
});

describe('resolutionClassOf', () => {
    test('reads the class from the rendered long edge', () => {
        expect(resolutionClassOf({ height: 768, width: 1376 })).toBe('1K');
        expect(resolutionClassOf({ height: 1536, width: 2752 })).toBe('2K');
        expect(resolutionClassOf({ height: 3072, width: 5504 })).toBe('4K');
    });
});

describe('renderedResolutionClass', () => {
    const nano = findImageGenerationModel('gemini-nano-banana-2.1');
    const flare = findImageGenerationModel('gpt-image-2.5-flare');
    if (!(flare && nano)) {
        throw new Error('registry models missing');
    }

    test('Gemini keeps the requested class whatever the aspect makes the long edge', () => {
        const { request } = resolve({ aspect: '21:9', resolution: '1K' });
        // 21:9 at 1K renders 1584x672, whose long edge alone would read as 2K.
        expect(resolutionClassOf({ height: 672, width: 1584 })).toBe('2K');
        expect(renderedResolutionClass(nano, request, { height: 672, width: 1584 })).toBe('1K');
    });

    test('OpenAI classes by the rendered long edge', () => {
        const { request } = resolve({ model: flare.id, size: { height: 1024, width: 2048 } });
        expect(renderedResolutionClass(flare, request, { height: 1024, width: 2048 })).toBe('2K');
    });
});

describe('costOfImageGeneration', () => {
    const flare = findImageGenerationModel('gpt-image-2.5-flare');
    const nano = findImageGenerationModel('gemini-nano-banana-2.1');
    if (!(flare && nano)) {
        throw new Error('registry models missing');
    }

    test('prices OpenAI usage per token class', () => {
        const cost = costOfImageGeneration({
            model: flare,
            request: resolve({ model: flare.id }).request,
            resolution: '1K',
            usage: { imageInputTokens: 1_000_000, outputTokens: 100_000, textInputTokens: 200_000 },
        });
        // 0.2M * $5 + 1M * $8 + 0.1M * $30
        expect(cost).toEqual({ basis: 'usage', usd: 12 });
    });

    test('prices the top OpenAI quality levels as high, labeled an estimate', () => {
        for (const quality of ['xhigh', 'max']) {
            expect(
                costOfImageGeneration({
                    model: flare,
                    request: resolve({ model: flare.id, quality }).request,
                    resolution: '1K',
                    usage: null,
                })
            ).toEqual({ basis: 'estimate', usd: 0.07 });
        }
    });

    test('a Gemini 21:9 at 1K prices as 1K', () => {
        const request = resolve({ aspect: '21:9', resolution: '1K' }).request;
        expect(
            costOfImageGeneration({
                model: nano,
                request,
                resolution: renderedResolutionClass(nano, request, { height: 672, width: 1584 }),
                usage: null,
            })
        ).toEqual({ basis: 'estimate', usd: 0.034 });
    });

    test('falls back to the registry estimate without usage', () => {
        expect(
            costOfImageGeneration({
                model: nano,
                request: resolve({}).request,
                resolution: '2K',
                usage: null,
            })
        ).toEqual({ basis: 'estimate', usd: 0.05 });
    });
});
