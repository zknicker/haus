import { avatarGenerationModel, avatarGenerationOutputFormat } from '@haus/api';
import { AvatarGenerationUnavailableError, AvatarProviderError } from './errors.ts';
import type { AvatarImageProvider, AvatarProviderRequest } from './types.ts';

const defaultEndpoint = 'https://api.openai.com/v1/images/generations';

type AvatarProviderFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class OpenAiAvatarImageProvider implements AvatarImageProvider {
    private readonly fetcher: AvatarProviderFetch;

    constructor(
        private readonly options: {
            apiKey?: string;
            endpoint?: string;
            fetcher?: AvatarProviderFetch;
        }
    ) {
        this.fetcher = options.fetcher ?? fetch;
    }

    get available(): boolean {
        return Boolean(this.options.apiKey);
    }

    async generate(request: AvatarProviderRequest) {
        if (!this.options.apiKey) {
            throw new AvatarGenerationUnavailableError();
        }

        let response: Response;
        try {
            response = await this.fetcher(this.options.endpoint ?? defaultEndpoint, {
                body: JSON.stringify({
                    model: request.model,
                    n: request.numberOfImages,
                    output_format: request.outputFormat,
                    prompt: request.prompt,
                    size: '1024x1024',
                }),
                headers: {
                    authorization: `Bearer ${this.options.apiKey}`,
                    'content-type': 'application/json',
                },
                method: 'POST',
                signal: AbortSignal.timeout(60_000),
            });
        } catch {
            throw new AvatarProviderError();
        }

        if (!response.ok) {
            throw new AvatarProviderError();
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new AvatarProviderError();
        }
        const encoded = readSingleBase64Image(payload);
        if (!encoded) {
            throw new AvatarProviderError();
        }

        return {
            bytes: Uint8Array.from(Buffer.from(encoded, 'base64')),
            mediaType: 'image/png' as const,
        };
    }
}

function readSingleBase64Image(payload: unknown): string | null {
    if (!(payload && typeof payload === 'object' && 'data' in payload)) {
        return null;
    }
    const data = payload.data;
    if (!(Array.isArray(data) && data.length === 1)) {
        return null;
    }
    const first = data[0];
    if (!(first && typeof first === 'object' && 'b64_json' in first)) {
        return null;
    }
    return typeof first.b64_json === 'string' && first.b64_json.length > 0 ? first.b64_json : null;
}

export const avatarProviderContract = {
    model: avatarGenerationModel,
    outputFormat: avatarGenerationOutputFormat,
} as const;
