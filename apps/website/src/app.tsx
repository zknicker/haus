import * as React from 'react';
import { RouterProvider } from 'react-router-dom';
import { createAppRouter } from './app-router.tsx';
import { ActivationFrame } from './components/activation/activation-frame.tsx';

export default function App() {
    const router = React.useMemo(() => createAppRouter(), []);
    return (
        <ActivationFrame>
            <RouterProvider router={router} />
        </ActivationFrame>
    );
}
