import type { ImageGeneration } from '@haus/api';

/** A generation record for tests; `result` and any field override the defaults. */
export function imageGenerationFixture(overrides: Partial<ImageGeneration> = {}): ImageGeneration {
    return {
        agentId: 'agt_1',
        computerId: 'cmp_1',
        createdAt: '2026-10-13T12:00:00.000Z',
        id: 'img_1',
        model: 'gpt-image-2.5-sunburst',
        modelDisplayName: 'GPT Image 2.5 Sunburst',
        prompt: 'A warm hero image for the launch post.',
        provider: 'openai',
        request: {
            aspect: null,
            aspectRatio: { height: 9, width: 16 },
            background: 'opaque',
            quality: null,
            referenceAttachmentIds: [],
            resolution: '2K',
            size: null,
        },
        result: { state: 'generating' },
        updatedAt: '2026-10-13T12:00:00.000Z',
        ...overrides,
    };
}

export const readyResult = {
    attachmentId: 'att_1',
    cost: { basis: 'usage', usd: 0.11 },
    durationMs: 21_000,
    height: 1152,
    resolution: '2K',
    state: 'ready',
    width: 2048,
} as const;

export const failedResult = {
    cost: null,
    durationMs: 4000,
    errorCode: 'provider_rejected',
    reason: 'The provider declined this prompt.',
    state: 'failed',
} as const;
