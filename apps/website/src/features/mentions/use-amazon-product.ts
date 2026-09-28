import {
    type AmazonProductDetail,
    type AmazonProductIdentity,
    type AmazonProductSummary,
    rankWranglerMcpUrl,
} from '@haus/api';
import { useQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { useConnections } from '../../hooks/servers/use-connections.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { createAmazonProductBatcher, type LoadAmazonProduct } from './amazon-product-batch.ts';

/** The chip renders in every state; only its label, image, and hover copy change. */
export type AmazonProductLookup =
    | { status: 'loading' }
    | { status: 'disconnected' }
    | { status: 'failed' }
    | {
          status: 'ready';
          /** `price` arrives with the detail read when the preview opens. */
          product: AmazonProductSummary & { price?: AmazonProductDetail['price'] };
          detailFailed: boolean;
      };

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
        queryFn: () => load(serverId, product),
        // Shares the procedure key so `utils.mcp.amazonProducts.invalidate` reaches it.
        queryKey: getQueryKey(
            hausTrpc.mcp.amazonProducts,
            { serverId, products: [product] },
            'query'
        ),
        refetchInterval: (query) =>
            query.state.data?.enrichment === 'pending' &&
            query.state.dataUpdateCount < enrichmentReads
                ? enrichmentRefetchMs
                : false,
        retry: false,
    });
    const ready = connected && summary.data ? summary.data : undefined;
    const detail = hausTrpc.mcp.amazonProductDetail.useQuery(
        { serverId, ...product },
        {
            ...queryPolicy.localConfig,
            enabled: previewOpen && ready !== undefined,
            retry: false,
        }
    );
    if (connections.isError) {
        return { status: 'failed' };
    }
    if (!connections.data) {
        return { status: 'loading' };
    }
    if (!connected || summary.data === null) {
        return { status: 'disconnected' };
    }
    if (summary.isError) {
        return { status: 'failed' };
    }
    if (!ready) {
        return { status: 'loading' };
    }
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
