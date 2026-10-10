import * as React from 'react';
import { Outlet } from 'react-router-dom';
import { HausServerProvider, hausTrpc } from '../../lib/haus-server.tsx';
import { DevAutoSignIn } from '../auth/dev-auto-sign-in.tsx';
import { SignInGate } from '../auth/sign-in-gate.tsx';
import { ServerEventListeners } from './server-event-listeners.tsx';

/**
 * Haus server routes talk straight to the Server.
 */
export function HausServerRoutes() {
    return (
        <>
            <DevAutoSignIn />
            <SignInGate>
                <HausServerProvider>
                    <DevelopmentBootstrap />
                    <ServerEventListeners />
                    <Outlet />
                </HausServerProvider>
            </SignInGate>
        </>
    );
}

function DevelopmentBootstrap() {
    const utils = hausTrpc.useUtils();
    const started = React.useRef(false);
    const bootstrap = hausTrpc.server.developmentBootstrap.useMutation({
        onSuccess: () => {
            void utils.server.invalidate();
        },
    });

    React.useEffect(() => {
        if (import.meta.env.DEV && !started.current) {
            started.current = true;
            bootstrap.mutate();
        }
    }, [bootstrap.mutate]);

    return null;
}
