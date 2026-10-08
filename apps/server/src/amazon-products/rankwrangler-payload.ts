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

export const summaryFields = ['shortName', 'cutoutThumbnail'] as const;

const getPayloadSchema = z.object({
    operation: z.literal('get'),
    data: z.object({
        asin: z.string(),
        marketplaceId: z.string(),
        listing: amazonProductSummarySchema.omit({ asin: true, marketplaceId: true }),
        price: amazonProductDetailSchema.shape.price,
    }),
});

/**
 * `get` with `include: summaryFields`. RankWrangler waits for the short name
 * and cutout, settling unfinished ones as `null` / `unavailable`.
 */
export function parseProductSummary(result: unknown): AmazonProductSummary {
    const { data } = getPayloadSchema.parse(rankWranglerPayload(result));
    return amazonProductSummarySchema.parse({ ...data.listing, ...identityOf(data) });
}

export function parseProductDetails(result: unknown): AmazonProductDetail {
    const { data } = getPayloadSchema.parse(rankWranglerPayload(result));
    return amazonProductDetailSchema.parse({
        ...data.listing,
        ...identityOf(data),
        price: data.price,
    });
}

export function assertSameProduct(
    actual: AmazonProductIdentity,
    expected: AmazonProductIdentity
): void {
    if (actual.asin !== expected.asin || actual.marketplaceId !== expected.marketplaceId) {
        throw new Error('RankWrangler returned a different product.');
    }
}

function identityOf(data: { asin: string; marketplaceId: string }) {
    return { asin: data.asin, marketplaceId: data.marketplaceId };
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
