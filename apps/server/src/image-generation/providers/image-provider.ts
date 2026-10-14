import type {
    ImageGenerationCost,
    ImageGenerationModel,
    ImageGenerationProvider,
    ImageGenerationRequest,
} from '@haus/api';

import { readImageHeader } from './image-dimensions.ts';

export type ImageProviderErrorKind =
    | 'auth'
    | 'content-policy'
    | 'invalid-request'
    | 'network'
    | 'provider-unavailable'
    | 'rate-limit';

/** A provider call that did not produce an image. `cost` is set only when the provider billed it. */
export class ImageProviderError extends Error {
    constructor(
        readonly kind: ImageProviderErrorKind,
        message: string,
        readonly cost: ImageGenerationCost | null = null
    ) {
        super(message);
        this.name = 'ImageProviderError';
    }
}

export interface ImageProviderReference {
    bytes: Uint8Array;
    filename: string;
    mediaType: string;
}

export interface ImageProviderRequest {
    model: ImageGenerationModel;
    prompt: string;
    references: ImageProviderReference[];
    /** The registry-validated, defaulted request the record stores. */
    request: ImageGenerationRequest;
}

/** Token usage a provider reported, split the way its price table prices it. */
export interface ImageProviderUsage {
    imageInputTokens: number;
    outputTokens: number;
    textInputTokens: number;
}

export interface ImageProviderResult {
    bytes: Uint8Array;
    height: number;
    mediaType: string;
    /** Null when the provider reports no usage; the cost is then a registry estimate. */
    usage: ImageProviderUsage | null;
    width: number;
}

/** One provider behind one narrow interface; keys are passed per call and never stored here. */
export interface ImageProviderAdapter {
    generate(request: ImageProviderRequest, apiKey: string): Promise<ImageProviderResult>;
}

export type ImageProviderFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export const imageProviderTimeoutMs = 5 * 60 * 1000;

/** Runs a provider request, mapping a transport failure to a typed `network` error. */
export async function fetchProvider(
    fetcher: ImageProviderFetch,
    url: string,
    init: RequestInit
): Promise<Response> {
    try {
        return await fetcher(url, { ...init, signal: AbortSignal.timeout(imageProviderTimeoutMs) });
    } catch (cause) {
        const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
        throw new ImageProviderError(
            'network',
            timedOut
                ? 'The image provider did not answer in time.'
                : 'The image provider could not be reached.'
        );
    }
}

/** Maps a non-2xx provider response to the typed error the generation records. */
export async function providerFailure(
    response: Response,
    provider: ImageGenerationProvider
): Promise<ImageProviderError> {
    const { status } = response;
    if (status === 401 || status === 403) {
        // Fixed text only: a provider's auth error can echo a fragment of the key,
        // and the reason is shown to everyone who reads the generation.
        const name = provider === 'openai' ? 'OpenAI' : 'Gemini';
        return new ImageProviderError(
            'auth',
            `The ${name} key was rejected. The Server Owner can replace it in Settings → Image generation.`
        );
    }
    const detail = await readErrorDetail(response);
    const suffix = detail ? `: ${detail}` : '';
    if (status === 429) {
        return new ImageProviderError(
            'rate-limit',
            `The image provider rate limit was reached${suffix}`
        );
    }
    if (/safety|content[_ ]policy|moderation|blocked/iu.test(detail)) {
        return new ImageProviderError(
            'content-policy',
            `The image provider declined this prompt${suffix}`
        );
    }
    if (status >= 400 && status < 500 && status !== 408) {
        return new ImageProviderError(
            'invalid-request',
            `The image provider rejected the request${suffix}`
        );
    }
    return new ImageProviderError(
        'provider-unavailable',
        `The image provider failed (${status})${suffix}`
    );
}

async function readErrorDetail(response: Response): Promise<string> {
    let text: string;
    try {
        text = await response.text();
    } catch {
        return '';
    }
    try {
        const parsed: unknown = JSON.parse(text);
        const error = isRecord(parsed) ? parsed.error : null;
        if (isRecord(error)) {
            const code = typeof error.code === 'string' ? `${error.code} ` : '';
            const message = typeof error.message === 'string' ? error.message : '';
            return `${code}${message}`.trim().slice(0, 500);
        }
    } catch {
        // Not JSON; fall through to the raw text.
    }
    return text.trim().slice(0, 300);
}

/** Reads the rendered size and type from the bytes; an unreadable image is a provider failure. */
export function toProviderResult(
    bytes: Uint8Array,
    usage: ImageProviderUsage | null
): ImageProviderResult {
    const header = readImageHeader(bytes);
    if (!header || header.width < 1 || header.height < 1) {
        throw new ImageProviderError(
            'provider-unavailable',
            'The image provider returned bytes that are not a readable image.'
        );
    }
    return {
        bytes,
        height: header.height,
        mediaType: header.mediaType,
        usage,
        width: header.width,
    };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
