import * as React from 'react';
import { RouterProvider } from 'react-router-dom';
import { createAppRouter } from './app-router.tsx';
import { ActivationFrame } from './components/activation/activation-frame.tsx';
import { AppRouterContext } from './hooks/shell/app-router-context.ts';

export default function App() {
    const router = React.useMemo(() => createAppRouter(), []);
    return (
        <ActivationFrame>
            <AppRouterContext value={router}>
                <RouterProvider router={router} />
            </AppRouterContext>
        </ActivationFrame>
    );
}
