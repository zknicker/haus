import {
    type AmazonProductIdentity,
    type AmazonProductResult,
    amazonProductResultAsin,
} from '@haus/api';

/** `null` means the Server has no connected RankWrangler account. */
export type ReadAmazonProducts = (input: {
    serverId: string;
    products: AmazonProductIdentity[];
}) => Promise<AmazonProductResult[] | null>;
export type LoadAmazonProduct = (
    serverId: string,
    product: AmazonProductIdentity
) => Promise<AmazonProductResult | null>;

const batchWindowMs = 10;
/** Matches the `mcp.amazonProducts` input limit. */
const batchLimit = 50;

interface Waiter {
    product: AmazonProductIdentity;
    settle: Array<{
        resolve: (result: AmazonProductResult | null) => void;
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
                (results) => {
                    for (const waiter of chunk) {
                        settleWaiter(waiter, results);
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

function settleWaiter(waiter: Waiter, results: AmazonProductResult[] | null) {
    const result = results?.find((item) => amazonProductResultAsin(item) === waiter.product.asin);
    for (const { reject, resolve } of waiter.settle) {
        if (results === null) {
            resolve(null);
        } else if (result) {
            resolve(result);
        } else {
            reject(new Error('Amazon product lookup omitted a product.'));
        }
    }
}
