import * as z from 'zod';
import {
    fetchProvider,
    type ImageProviderAdapter,
    ImageProviderError,
    type ImageProviderFetch,
    type ImageProviderRequest,
    type ImageProviderResult,
    isRecord,
    providerFailure,
    toProviderResult,
} from './image-provider.ts';

/*
 * Gemini generateContent boundary. Endpoint, field names, and the registry-id
 * to provider-model-id map live only in this file (specs/image-generation.md).
 */
const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
const providerModelIds: Record<string, string> = {
    'gemini-3-pro-image': 'gemini-3-pro-image',
    'gemini-nano-banana-2.1': 'gemini-nano-banana-2.1',
};

const blockedFinishReasons = new Set([
    'BLOCKLIST',
    'IMAGE_PROHIBITED_CONTENT',
    'IMAGE_SAFETY',
    'PROHIBITED_CONTENT',
    'SAFETY',
]);

const partSchema = z.object({
    inlineData: z.object({ data: z.string().min(1), mimeType: z.string() }).optional(),
});

export class GeminiImageAdapter implements ImageProviderAdapter {
    private readonly fetcher: ImageProviderFetch;

    constructor(fetcher: ImageProviderFetch = fetch) {
        this.fetcher = fetcher;
    }

    async generate(request: ImageProviderRequest, apiKey: string): Promise<ImageProviderResult> {
        const modelId = providerModelIds[request.model.id] ?? request.model.id;
        const response = await fetchProvider(
            this.fetcher,
            `${baseUrl}/${modelId}:generateContent`,
            {
                body: JSON.stringify(requestBody(request)),
                headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
                method: 'POST',
            }
        );
        if (!response.ok) {
            throw await providerFailure(response, 'gemini');
        }
        const payload: unknown = await response.json().catch(() => null);
        const image = readImage(payload);
        // Gemini reports no priced usage for images; the cost is the registry estimate.
        return toProviderResult(Uint8Array.from(Buffer.from(image, 'base64')), null);
    }
}

function requestBody(request: ImageProviderRequest) {
    const { aspect, resolution } = request.request;
    return {
        contents: [
            {
                parts: [
                    { text: request.prompt },
                    ...request.references.map((reference) => ({
                        inlineData: {
                            data: Buffer.from(reference.bytes).toString('base64'),
                            mimeType: reference.mediaType,
                        },
                    })),
                ],
            },
        ],
        generationConfig: {
            imageConfig: {
                ...(aspect && { aspectRatio: aspect }),
                ...(resolution && { imageSize: resolution }),
            },
            responseModalities: ['IMAGE'],
        },
    };
}

function readImage(payload: unknown): string {
    const candidate =
        isRecord(payload) && Array.isArray(payload.candidates) ? payload.candidates[0] : null;
    const parts =
        isRecord(candidate) && isRecord(candidate.content) ? candidate.content.parts : null;
    if (Array.isArray(parts)) {
        for (const part of parts) {
            const parsed = partSchema.safeParse(part);
            if (parsed.success && parsed.data.inlineData) {
                return parsed.data.inlineData.data;
            }
        }
    }
    const finishReason =
        isRecord(candidate) && typeof candidate.finishReason === 'string'
            ? candidate.finishReason
            : '';
    const blockReason =
        isRecord(payload) &&
        isRecord(payload.promptFeedback) &&
        typeof payload.promptFeedback.blockReason === 'string'
            ? payload.promptFeedback.blockReason
            : '';
    if (blockReason || blockedFinishReasons.has(finishReason)) {
        throw new ImageProviderError(
            'content-policy',
            `The image provider declined this prompt (${blockReason || finishReason}).`
        );
    }
    throw new ImageProviderError(
        'provider-unavailable',
        `The image provider returned no image${finishReason ? ` (${finishReason})` : ''}.`
    );
}
