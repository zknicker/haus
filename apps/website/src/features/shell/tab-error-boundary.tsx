import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ServerErrorView } from '../../routes/app/server-error-page.tsx';
import { serverRoute } from '../servers/server-routes.ts';
import { useDesktopShell } from './use-tab-navigator.ts';

/**
 * A desktop tab's page boundary. Tab routers are plain routers, so route
 * `errorElement`s never fire there; this keeps a failing page inside its tab
 * and resets when the tab moves to another history entry.
 */
// biome-ignore lint/style/useReactFunctionComponents: React has no function-hook error boundary.
export class TabErrorBoundary extends React.Component<
    { children: React.ReactNode; resetKey: string },
    { error: unknown; failedKey: string | null }
> {
    override state = { error: null as unknown, failedKey: null as string | null };

    static getDerivedStateFromError(error: unknown) {
        return { error };
    }

    static getDerivedStateFromProps(
        props: { resetKey: string },
        state: { error: unknown; failedKey: string | null }
    ) {
        if (state.failedKey === null && state.error !== null) {
            return { failedKey: props.resetKey };
        }
        return state.failedKey !== null && state.failedKey !== props.resetKey
            ? { error: null, failedKey: null }
            : null;
    }

    override render() {
        return this.state.error === null ? (
            this.props.children
        ) : (
            <TabErrorPage error={this.state.error} />
        );
    }
}

function TabErrorPage({ error }: { error: unknown }) {
    const navigate = useNavigate();
    const { slug } = useDesktopShell().server;
    // Replace, so the failing entry leaves the tab's history instead of opening another pane.
    return (
        <ServerErrorView
            error={error}
            onBack={() => navigate(serverRoute(slug), { replace: true })}
        />
    );
}
