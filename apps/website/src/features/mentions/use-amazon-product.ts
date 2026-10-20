import type { AmazonProductIdentity } from '@haus/api';
import { useQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import type { RenderedChipAvailability } from '../../hooks/servers/use-connection-chip.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import {
    type AmazonProductLookup,
    amazonProductLookupState,
    type SettledAmazonProduct,
} from './amazon-product-lookup.ts';
import {
    AmazonProductTemporaryError,
    amazonProductRecoveryMs,
    amazonProductRetryDelay,
    retryAmazonProduct,
} from './amazon-product-retry.ts';

// Slow upstream reads: their own HTTP request, so neither waits on nor holds a batch.
const unbatched = { context: { skipBatch: true } };

export function useAmazonProduct(
    serverId: string,
    product: AmazonProductIdentity,
    chip: RenderedChipAvailability,
    previewOpen: boolean
): AmazonProductLookup {
    const utils = hausTrpc.useUtils();
    const connected = chip === 'available';
    const input = { serverId, ...product };
    const summary = useQuery({
        ...queryPolicy.localConfig,
        enabled: connected,
        queryFn: async (): Promise<SettledAmazonProduct> => {
            const result = await utils.client.mcp.amazonProduct.query(input, unbatched);
            if (result?.status === 'temporarilyUnavailable') {
                throw new AmazonProductTemporaryError(result.retryAfterSeconds);
            }
            return result;
        },
        // Shares the procedure key so `utils.mcp.amazonProduct.invalidate` reaches it.
        queryKey: getQueryKey(hausTrpc.mcp.amazonProduct, input, 'query'),
        refetchInterval: (query) => {
            const { data, errorUpdateCount } = query.state;
            // Gave up after bounded retries: recover by itself while the card is open.
            return data === undefined && errorUpdateCount > 0 && previewOpen
                ? amazonProductRecoveryMs
                : false;
        },
        retry: retryAmazonProduct,
        retryDelay: amazonProductRetryDelay,
    });
    const found = connected && summary.data?.status === 'found' ? summary.data.product : undefined;
    const detail = hausTrpc.mcp.amazonProductDetail.useQuery(input, {
        ...queryPolicy.localConfig,
        enabled: previewOpen && found !== undefined,
        trpc: unbatched,
    });
    if (chip === 'error') {
        return { status: 'temporarilyUnavailable' };
    }
    if (chip === 'loading') {
        return { status: 'loading' };
    }
    const state = amazonProductLookupState(summary);
    if (state.status !== 'found') {
        return state;
    }
    const ready = state.product;
    return {
        status: 'ready',
        product: detail.data
            ? {
                  ...detail.data,
                  brand: detail.data.brand ?? ready.brand,
                  shortName: ready.shortName,
                  cutoutThumbnail: ready.cutoutThumbnail,
              }
            : ready,
        detailFailed: detail.isError,
    };
}
