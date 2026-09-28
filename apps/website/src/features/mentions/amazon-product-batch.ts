import type { AmazonProductIdentity, AmazonProductSummary } from '@haus/api';

/** `null` means the Server has no connected RankWrangler account. */
export type ReadAmazonProducts = (input: {
    serverId: string;
    products: AmazonProductIdentity[];
}) => Promise<AmazonProductSummary[] | null>;
export type LoadAmazonProduct = (
    serverId: string,
    product: AmazonProductIdentity
) => Promise<AmazonProductSummary | null>;

const batchWindowMs = 10;
/** Matches the `mcp.amazonProducts` input limit. */
const batchLimit = 50;

interface Waiter {
    product: AmazonProductIdentity;
    settle: Array<{
        resolve: (summary: AmazonProductSummary | null) => void;
        reject: (error: unknown) => void;
    }>;
}

/**
 * Coalesces every chip that mounts in the same tick into one Server read, so a
 * message full of ASINs is one `mcp.amazonProducts` call rather than a fan-out.
 */
export function createAmazonProductBatcher(read: ReadAmazonProducts): LoadAmazonProduct {
    const queues = new Map<string, Map<string, Waiter>>();
    const flush = (serverId: string) => {
        const waiters = [...(queues.get(serverId)?.values() ?? [])];
        queues.delete(serverId);
        for (let start = 0; start < waiters.length; start += batchLimit) {
            const chunk = waiters.slice(start, start + batchLimit);
            read({ serverId, products: chunk.map((waiter) => waiter.product) }).then(
                (summaries) => {
                    for (const waiter of chunk) {
                        settleWaiter(waiter, summaries);
                    }
                },
                (error: unknown) => {
                    for (const waiter of chunk) {
                        for (const { reject } of waiter.settle) {
                            reject(error);
                        }
                    }
                }
            );
        }
    };
    return (serverId, product) =>
        new Promise((resolve, reject) => {
            let queue = queues.get(serverId);
            if (!queue) {
                queue = new Map();
                queues.set(serverId, queue);
                setTimeout(() => flush(serverId), batchWindowMs);
            }
            const waiter = queue.get(product.asin) ?? { product, settle: [] };
            waiter.settle.push({ resolve, reject });
            queue.set(product.asin, waiter);
        });
}

function settleWaiter(waiter: Waiter, summaries: AmazonProductSummary[] | null) {
    const summary = summaries?.find((item) => item.asin === waiter.product.asin);
    for (const { reject, resolve } of waiter.settle) {
        if (summaries === null) {
            resolve(null);
        } else if (summary) {
            resolve(summary);
        } else {
            reject(new Error('Amazon product lookup omitted a product.'));
        }
    }
}
