import { hausTrpc } from '../../lib/haus-server.tsx';

export function useClaimCreate() {
    return hausTrpc.claim.create.useMutation();
}
