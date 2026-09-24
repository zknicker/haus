import { type AmazonProductIdentity, rankWranglerMcpUrl } from '@haus/api';
import { useConnections } from '../../hooks/servers/use-connections.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useAmazonProduct(
    serverId: string,
    product: AmazonProductIdentity,
    previewOpen: boolean
) {
    const connections = useConnections(serverId);
    const enabled =
        connections.data?.some(
            (connection) => connection.connected && connection.url === rankWranglerMcpUrl
        ) ?? false;
    const summary = hausTrpc.mcp.amazonProducts.useQuery(
        { serverId, products: [product] },
        {
            ...queryPolicy.localConfig,
            enabled,
            retry: false,
        }
    );
    const detail = hausTrpc.mcp.amazonProductDetail.useQuery(
        { serverId, ...product },
        {
            ...queryPolicy.localConfig,
            enabled: enabled && previewOpen,
            retry: false,
        }
    );
    return {
        product: enabled ? summary.data?.[0] : undefined,
        detail: enabled ? detail.data : undefined,
        detailFailed: detail.isError,
    };
}
