import { expect, test } from 'bun:test';
import { buildAvatarGenerationPrompt } from '@haus/api';
import { AvatarGenerationUnavailableError, AvatarProviderError } from './errors.ts';
import { OpenAiAvatarImageProvider } from './openai-provider.ts';

const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('sends one canonical gpt-image-2 request without a reference image', async () => {
    let received: { body?: string; headers?: Headers; method?: string; url?: string } = {};
    const provider = new OpenAiAvatarImageProvider({
        apiKey: 'test-key',
        fetcher: async (input, init) => {
            received = {
                body: String(init?.body),
                headers: new Headers(init?.headers),
                method: init?.method,
                url: String(input),
            };
            return Response.json({ data: [{ b64_json: pngBase64 }] });
        },
    });

    const image = await provider.generate({
        model: 'gpt-image-2',
        numberOfImages: 1,
        outputFormat: 'png',
        prompt: buildAvatarGenerationPrompt('a cloud fox'),
    });

    expect(received.url).toBe('https://api.openai.com/v1/images/generations');
    expect(received.method).toBe('POST');
    expect(received.headers?.get('authorization')).toBe('Bearer test-key');
    expect(JSON.parse(received.body ?? '')).toEqual({
        model: 'gpt-image-2',
        n: 1,
        output_format: 'png',
        prompt: buildAvatarGenerationPrompt('a cloud fox'),
        size: '1024x1024',
    });
    expect(JSON.parse(received.body ?? '')).not.toHaveProperty('image');
    expect(image).toEqual({
        bytes: Uint8Array.from(Buffer.from(pngBase64, 'base64')),
        mediaType: 'image/png',
    });
});

test('maps unavailable and malformed provider responses to safe errors', async () => {
    const unavailable = new OpenAiAvatarImageProvider({});
    await expect(
        unavailable.generate({
            model: 'gpt-image-2',
            numberOfImages: 1,
            outputFormat: 'png',
            prompt: 'prompt',
        })
    ).rejects.toBeInstanceOf(AvatarGenerationUnavailableError);

    const malformed = new OpenAiAvatarImageProvider({
        apiKey: 'test-key',
        fetcher: async () => Response.json({ data: [] }),
    });
    await expect(
        malformed.generate({
            model: 'gpt-image-2',
            numberOfImages: 1,
            outputFormat: 'png',
            prompt: 'prompt',
        })
    ).rejects.toBeInstanceOf(AvatarProviderError);
});
