import { useOutletContext } from 'react-router-dom';
import type { ServerDetail } from '../../lib/haus-server.tsx';

export interface ServerContextValue {
    server: ServerDetail;
}

export function useServerContext() {
    return useOutletContext<ServerContextValue>();
}
