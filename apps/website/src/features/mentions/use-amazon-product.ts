import { type AmazonProductIdentity, rankWranglerMcpUrl } from '@haus/api';
import { useQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { useConnections } from '../../hooks/servers/use-connections.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { createAmazonProductBatcher, type LoadAmazonProduct } from './amazon-product-batch.ts';
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

const enrichmentRefetchMs = 5000;
/** Initial read plus three refetches while RankWrangler generates the short name and cutout. */
const enrichmentReads = 4;

export function useAmazonProduct(
    serverId: string,
    product: AmazonProductIdentity,
    previewOpen: boolean
): AmazonProductLookup {
    const utils = hausTrpc.useUtils();
    const connections = useConnections(serverId);
    const connected =
        connections.data?.some(
            (connection) => connection.connected && connection.url === rankWranglerMcpUrl
        ) ?? false;
    const load = amazonProductLoader(utils.client);
    const summary = useQuery({
        ...queryPolicy.localConfig,
        enabled: connected,
        queryFn: async (): Promise<SettledAmazonProduct> => {
            const result = await load(serverId, product);
            if (result?.status === 'temporarilyUnavailable') {
                throw new AmazonProductTemporaryError(result.retryAfterSeconds);
            }
            return result;
        },
        // Shares the procedure key so `utils.mcp.amazonProducts.invalidate` reaches it.
        queryKey: getQueryKey(
            hausTrpc.mcp.amazonProducts,
            { serverId, products: [product] },
            'query'
        ),
        refetchInterval: (query) => {
            const { data, dataUpdateCount, errorUpdateCount } = query.state;
            if (data === undefined) {
                // Gave up after bounded retries: recover by itself while the card is open.
                return errorUpdateCount > 0 && previewOpen ? amazonProductRecoveryMs : false;
            }
            return data?.status === 'found' &&
                data.product.enrichment === 'pending' &&
                dataUpdateCount < enrichmentReads
                ? enrichmentRefetchMs
                : false;
        },
        retry: retryAmazonProduct,
        retryDelay: amazonProductRetryDelay,
    });
    const found = connected && summary.data?.status === 'found' ? summary.data.product : undefined;
    const detail = hausTrpc.mcp.amazonProductDetail.useQuery(
        { serverId, ...product },
        {
            ...queryPolicy.localConfig,
            enabled: previewOpen && found !== undefined,
        }
    );
    if (connections.isError) {
        return { status: 'temporarilyUnavailable' };
    }
    if (!connections.data) {
        return { status: 'loading' };
    }
    if (!connected || summary.data === null) {
        return { status: 'disconnected' };
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

const loaders = new WeakMap<object, LoadAmazonProduct>();

function amazonProductLoader(client: ReturnType<typeof hausTrpc.useUtils>['client']) {
    let load = loaders.get(client);
    if (!load) {
        load = createAmazonProductBatcher((input) => client.mcp.amazonProducts.query(input));
        loaders.set(client, load);
    }
    return load;
}
