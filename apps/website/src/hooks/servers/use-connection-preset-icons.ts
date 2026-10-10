import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useConnectionPresetIcons(serverId: string) {
    return hausTrpc.mcp.presetIcons.useQuery({ serverId }, queryPolicy.localConfig);
}
