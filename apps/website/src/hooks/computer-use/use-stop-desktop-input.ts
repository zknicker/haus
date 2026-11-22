import { hausTrpc } from '../../lib/haus-server.tsx';

export function useStopDesktopInput() {
    return hausTrpc.computer.stopDesktopInput.useMutation();
}
