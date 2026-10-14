import { describe, expect, test } from 'bun:test';
import { agentImageGenerationCreateInputSchema } from '@haus/api';
import { resolveImageGenerationRequest } from '../image-generation-request.ts';
import { GeminiImageAdapter } from './gemini-image-adapter.ts';
import { ImageProviderError } from './image-provider.ts';
import { OpenAiImageAdapter } from './openai-image-adapter.ts';

/** A PNG header carrying only the claimed size; adapters read nothing else. */
function pngHeader(width: number, height: number): Uint8Array {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return bytes;
}

function providerRequest(overrides: Record<string, unknown>, references = 0) {
    const { model, request } = resolveImageGenerationRequest(
        agentImageGenerationCreateInputSchema.parse({
            model: 'gpt-image-2.5-sunburst',
            nonce: 'n',
            prompt: 'a fox',
            ...overrides,
        })
    );
    return {
        model,
        prompt: 'a fox',
        references: Array.from({ length: references }, (_, index) => ({
            bytes: new Uint8Array([1, 2, 3]),
            filename: `ref-${index}.png`,
            mediaType: 'image/png',
        })),
        request,
    };
}

function fakeFetch(respond: (url: string, init: RequestInit) => Response) {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetcher = async (input: string | URL, init: RequestInit = {}) => {
        calls.push({ init, url: String(input) });
        return respond(String(input), init);
    };
    return { calls, fetcher };
}

const openAiBody = (width: number, height: number, usage?: object) =>
    Response.json({
        data: [{ b64_json: Buffer.from(pngHeader(width, height)).toString('base64') }],
        usage,
    });

describe('OpenAiImageAdapter', () => {
    test('generates through /generations and reads size and usage from the response', async () => {
        const { calls, fetcher } = fakeFetch(() =>
            openAiBody(1024, 1024, {
                input_tokens: 50,
                input_tokens_details: { image_tokens: 0, text_tokens: 50 },
                output_tokens: 4000,
            })
        );
        const result = await new OpenAiImageAdapter(fetcher).generate(
            providerRequest({ quality: 'high', size: { height: 1024, width: 1024 } }),
            'sk-test-key'
        );
        expect(result).toMatchObject({
            height: 1024,
            mediaType: 'image/png',
            usage: { imageInputTokens: 0, outputTokens: 4000, textInputTokens: 50 },
            width: 1024,
        });
        expect(calls[0]?.url).toBe('https://api.openai.com/v1/images/generations');
        expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe(
            'Bearer sk-test-key'
        );
        expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
            background: 'opaque',
            model: 'gpt-image-2.5-sunburst',
            n: 1,
            output_format: 'png',
            quality: 'high',
            size: '1024x1024',
        });
    });

    test('edits with multipart image[] files when references exist', async () => {
        const { calls, fetcher } = fakeFetch(() => openAiBody(1024, 1024));
        await new OpenAiImageAdapter(fetcher).generate(providerRequest({}, 2), 'sk-test-key');
        expect(calls[0]?.url).toBe('https://api.openai.com/v1/images/edits');
        const form = calls[0]?.init.body as FormData;
        expect(form.getAll('image[]')).toHaveLength(2);
        expect(form.get('prompt')).toBe('a fox');
    });

    test.each([
        [401, {}, 'auth'],
        [429, {}, 'rate-limit'],
        [400, { error: { code: 'moderation_blocked', message: 'no' } }, 'content-policy'],
        [400, { error: { message: 'bad size' } }, 'invalid-request'],
        [503, {}, 'provider-unavailable'],
    ])('maps HTTP %d to %s', async (status, body, kind) => {
        const { fetcher } = fakeFetch(() => Response.json(body, { status }));
        const failure = await new OpenAiImageAdapter(fetcher)
            .generate(providerRequest({}), 'k')
            .catch((cause: unknown) => cause);
        expect(failure).toBeInstanceOf(ImageProviderError);
        expect((failure as ImageProviderError).kind).toBe(kind as ImageProviderError['kind']);
    });

    test('an auth failure never echoes provider text, which can carry key fragments', async () => {
        const { fetcher } = fakeFetch(() =>
            Response.json(
                { error: { message: 'Incorrect API key provided: sk-proj-********wxyz.' } },
                { status: 401 }
            )
        );
        const failure = (await new OpenAiImageAdapter(fetcher)
            .generate(providerRequest({}), 'sk-proj-secretwxyz')
            .catch((cause: unknown) => cause)) as ImageProviderError;
        expect(failure.kind).toBe('auth');
        expect(failure.message).toBe(
            'The OpenAI key was rejected. The Server Owner can replace it in Settings → Image generation.'
        );
    });

    test('maps a transport failure to network', async () => {
        const failure = await new OpenAiImageAdapter(async () => {
            throw new Error('socket hang up');
        })
            .generate(providerRequest({}), 'k')
            .catch((cause: unknown) => cause);
        expect((failure as ImageProviderError).kind).toBe('network');
    });
});

describe('GeminiImageAdapter', () => {
    const geminiOk = (width: number, height: number) =>
        Response.json({
            candidates: [
                {
                    content: {
                        parts: [
                            { text: 'here you go' },
                            {
                                inlineData: {
                                    data: Buffer.from(pngHeader(width, height)).toString('base64'),
                                    mimeType: 'image/png',
                                },
                            },
                        ],
                    },
                },
            ],
        });

    test('sends aspect, size class, and references; reports no usage', async () => {
        const { calls, fetcher } = fakeFetch(() => geminiOk(1376, 768));
        const result = await new GeminiImageAdapter(fetcher).generate(
            providerRequest(
                { aspect: '16:9', model: 'gemini-nano-banana-2.1', resolution: '1K' },
                1
            ),
            'g-key'
        );
        expect(result).toMatchObject({ height: 768, usage: null, width: 1376 });
        expect(calls[0]?.url).toBe(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-nano-banana-2.1:generateContent'
        );
        expect((calls[0]?.init.headers as Record<string, string>)['x-goog-api-key']).toBe('g-key');
        const body = JSON.parse(String(calls[0]?.init.body));
        expect(body.generationConfig).toEqual({
            imageConfig: { aspectRatio: '16:9', imageSize: '1K' },
            responseModalities: ['IMAGE'],
        });
        expect(body.contents[0].parts).toHaveLength(2);
        expect(body.contents[0].parts[1].inlineData.mimeType).toBe('image/png');
    });

    test('maps a safety stop to content-policy and a missing image to provider-unavailable', async () => {
        const blocked = fakeFetch(() =>
            Response.json({ candidates: [{ finishReason: 'IMAGE_SAFETY' }] })
        );
        const policy = await new GeminiImageAdapter(blocked.fetcher)
            .generate(providerRequest({ model: 'gemini-3-pro-image' }), 'k')
            .catch((cause: unknown) => cause);
        expect((policy as ImageProviderError).kind).toBe('content-policy');

        const empty = fakeFetch(() => Response.json({ candidates: [{ finishReason: 'STOP' }] }));
        const missing = await new GeminiImageAdapter(empty.fetcher)
            .generate(providerRequest({ model: 'gemini-3-pro-image' }), 'k')
            .catch((cause: unknown) => cause);
        expect((missing as ImageProviderError).kind).toBe('provider-unavailable');
    });

    test('maps Gemini invalid-key 400 to the fixed auth reason', async () => {
        const { fetcher } = fakeFetch(() =>
            Response.json(
                {
                    error: {
                        code: 400,
                        details: [
                            {
                                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                                reason: 'API_KEY_INVALID',
                            },
                        ],
                        message: 'API key not valid. Please pass a valid API key: AIzaSyLEAK',
                        status: 'INVALID_ARGUMENT',
                    },
                },
                { status: 400 }
            )
        );
        const failure = await new GeminiImageAdapter(fetcher)
            .generate(providerRequest({ model: 'gemini-3-pro-image' }), 'k')
            .catch((cause: unknown) => cause);
        expect((failure as ImageProviderError).kind).toBe('auth');
        expect((failure as ImageProviderError).message).toBe(
            'The Gemini key was rejected. The Server Owner can replace it in Settings → Image generation.'
        );
    });

    test('maps an auth failure', async () => {
        const { fetcher } = fakeFetch(() =>
            Response.json({ error: { message: 'bad key' } }, { status: 403 })
        );
        const failure = await new GeminiImageAdapter(fetcher)
            .generate(providerRequest({ model: 'gemini-3-pro-image' }), 'k')
            .catch((cause: unknown) => cause);
        expect((failure as ImageProviderError).kind).toBe('auth');
        expect((failure as ImageProviderError).message).toBe(
            'The Gemini key was rejected. The Server Owner can replace it in Settings → Image generation.'
        );
    });
});
