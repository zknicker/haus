import * as React from 'react';
import type { createBrowserRouter } from 'react-router-dom';

export type AppRouter = ReturnType<typeof createBrowserRouter>;

export const AppRouterContext = React.createContext<AppRouter | null>(null);

export function useAppRouter() {
    return React.use(AppRouterContext);
}
