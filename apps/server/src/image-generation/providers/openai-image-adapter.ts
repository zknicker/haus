import * as z from 'zod';
import {
    fetchProvider,
    type ImageProviderAdapter,
    ImageProviderError,
    type ImageProviderFetch,
    type ImageProviderRequest,
    type ImageProviderResult,
    type ImageProviderUsage,
    providerFailure,
    toProviderResult,
} from './image-provider.ts';

/*
 * OpenAI Images API boundary. Endpoint, field names, and the registry-id to
 * provider-model-id map live only in this file (specs/image-generation.md).
 */
const generationsUrl = 'https://api.openai.com/v1/images/generations';
const editsUrl = 'https://api.openai.com/v1/images/edits';
const providerModelIds: Record<string, string> = {
    'gpt-image-2.5-flare': 'gpt-image-2.5-flare',
    'gpt-image-2.5-sunburst': 'gpt-image-2.5-sunburst',
};

const responseSchema = z.object({
    data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
    usage: z
        .object({
            input_tokens: z.number().nonnegative(),
            input_tokens_details: z
                .object({
                    image_tokens: z.number().nonnegative().optional(),
                    text_tokens: z.number().nonnegative().optional(),
                })
                .optional(),
            output_tokens: z.number().nonnegative(),
        })
        .optional(),
});

export class OpenAiImageAdapter implements ImageProviderAdapter {
    private readonly fetcher: ImageProviderFetch;

    constructor(fetcher: ImageProviderFetch = fetch) {
        this.fetcher = fetcher;
    }

    async generate(request: ImageProviderRequest, apiKey: string): Promise<ImageProviderResult> {
        const response = await fetchProvider(
            this.fetcher,
            request.references.length > 0 ? editsUrl : generationsUrl,
            {
                body: requestBody(request),
                headers: {
                    authorization: `Bearer ${apiKey}`,
                    ...(request.references.length === 0 && { 'content-type': 'application/json' }),
                },
                method: 'POST',
            }
        );
        if (!response.ok) {
            throw await providerFailure(response, 'openai');
        }
        const parsed = responseSchema.safeParse(await response.json().catch(() => null));
        if (!parsed.success) {
            throw new ImageProviderError(
                'provider-unavailable',
                'The image provider returned no image.'
            );
        }
        return toProviderResult(
            Uint8Array.from(Buffer.from(parsed.data.data[0].b64_json, 'base64')),
            toUsage(parsed.data.usage)
        );
    }
}

function requestBody(request: ImageProviderRequest): string | FormData {
    const { size } = request.request;
    const fields: Record<string, string> = {
        background: request.request.background,
        model: providerModelIds[request.model.id] ?? request.model.id,
        n: '1',
        output_format: 'png',
        prompt: request.prompt,
        ...(size && { size: `${size.width}x${size.height}` }),
        ...(request.request.quality && { quality: request.request.quality }),
    };
    if (request.references.length === 0) {
        return JSON.stringify({ ...fields, n: 1 });
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) {
        form.append(name, value);
    }
    for (const reference of request.references) {
        form.append(
            'image[]',
            new Blob([new Uint8Array(reference.bytes)], { type: reference.mediaType }),
            reference.filename
        );
    }
    return form;
}

function toUsage(usage: z.infer<typeof responseSchema>['usage']): ImageProviderUsage | null {
    if (!usage) {
        return null;
    }
    const details = usage.input_tokens_details;
    const imageInputTokens = details?.image_tokens ?? 0;
    return {
        imageInputTokens,
        outputTokens: usage.output_tokens,
        textInputTokens: details?.text_tokens ?? Math.max(0, usage.input_tokens - imageInputTokens),
    };
}
