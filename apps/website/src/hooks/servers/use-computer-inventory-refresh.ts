import { hausTrpc } from '../../lib/haus-server.tsx';

export function useComputerInventoryRefresh() {
    return hausTrpc.computer.refreshInventory.useMutation();
}
