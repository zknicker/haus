import {
    type AmazonProductDetail,
    type AmazonProductIdentity,
    type AmazonProductSummary,
    amazonProductDetailSchema,
    amazonProductSummarySchema,
} from '@haus/api';
import { z } from 'zod';

/** A standard RankWrangler error response, such as `TEMPORARILY_UNAVAILABLE`. */
export class RankWranglerError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    readonly retryAfterSeconds: number | null;
    constructor(code: string, retryable: boolean, retryAfterSeconds: number | null = null) {
        super(`RankWrangler product lookup failed (${code}).`);
        this.name = 'RankWranglerError';
        this.code = code;
        this.retryable = retryable;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

const envelopeSchema = z.object({
    isError: z.boolean().optional(),
    structuredContent: z.unknown().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
});
const errorBodySchema = z.object({
    error: z.object({
        code: z.string(),
        retryable: z.boolean().optional(),
        retryAfterSeconds: z.number().nonnegative().optional(),
    }),
});

export function rankWranglerPayload(result: unknown): unknown {
    const envelope = envelopeSchema.parse(result);
    const text = envelope.content?.find((block) => block.type === 'text')?.text;
    if (envelope.isError) {
        const body = errorBodySchema.safeParse(envelope.structuredContent ?? parseJson(text));
        if (body.success) {
            const { code, retryable, retryAfterSeconds } = body.data.error;
            throw new RankWranglerError(code, retryable ?? false, retryAfterSeconds ?? null);
        }
        throw new Error('RankWrangler product lookup failed.');
    }
    if (envelope.structuredContent !== undefined) {
        return envelope.structuredContent;
    }
    if (!text) {
        throw new Error('RankWrangler returned no product data.');
    }
    return JSON.parse(text);
}

export function parseProductDetails(result: unknown): AmazonProductDetail {
    const { data } = z
        .object({
            operation: z.literal('get'),
            data: z.object({
                asin: z.string(),
                marketplaceId: z.string(),
                listing: amazonProductSummarySchema.omit({ asin: true, marketplaceId: true }),
                price: amazonProductDetailSchema.shape.price,
            }),
        })
        .parse(rankWranglerPayload(result));
    return amazonProductDetailSchema.parse({
        ...data,
        ...data.listing,
    });
}

/** `getMany` returns fixed-shape basics: title, thumbnail, and listing status. */
export function parseProductSummaries(result: unknown): AmazonProductSummary[] {
    return z
        .object({ operation: z.literal('getMany'), data: z.array(amazonProductSummarySchema) })
        .parse(rankWranglerPayload(result)).data;
}

export function assertSameProduct(
    actual: AmazonProductIdentity,
    expected: AmazonProductIdentity
): void {
    if (actual.asin !== expected.asin || actual.marketplaceId !== expected.marketplaceId) {
        throw new Error('RankWrangler returned a different product.');
    }
}

function parseJson(text: string | undefined): unknown {
    if (!text) {
        return undefined;
    }
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}
