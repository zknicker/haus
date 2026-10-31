import { Outlet } from 'react-router-dom';
import { useAppAuth } from '../../lib/app-auth.tsx';
import { HausServerProvider } from '../../lib/haus-server.tsx';

/** Standalone Computer login is public until approval, then authenticates only the approval call. */
export function ComputerLoginRoutes() {
    const { session } = useAppAuth();
    return (
        <HausServerProvider key={session?.user.id ?? 'signed-out'}>
            <Outlet />
        </HausServerProvider>
    );
}
