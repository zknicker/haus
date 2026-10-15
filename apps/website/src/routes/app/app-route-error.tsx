import { Button } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import { Compass01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { ServerErrorView } from './server-error-page.tsx';

/**
 * The window router's last resort: an address no route matches gets a calm
 * "page not found" with the way home, never React Router's raw error page;
 * anything else thrown above a Server's own boundary gets the page-level
 * error surface.
 */
export function AppRouteError() {
    const error = useRouteError();
    const navigate = useNavigate();
    if (isRouteErrorResponse(error) && error.status === 404) {
        return (
            <main className="flex min-h-dvh flex-1 items-center justify-center bg-background px-6 py-10">
                <EmptyState>
                    <EmptyState.Header>
                        <EmptyState.Media variant="icon">
                            <Icon icon={Compass01Icon} />
                        </EmptyState.Media>
                        <EmptyState.Title>Page not found</EmptyState.Title>
                        <EmptyState.Description>
                            Nothing lives at this address. It may have moved, or the link may be
                            incomplete.
                        </EmptyState.Description>
                    </EmptyState.Header>
                    <EmptyState.Content>
                        <Button onPress={() => navigate('/', { replace: true })}>Go to Haus</Button>
                    </EmptyState.Content>
                </EmptyState>
            </main>
        );
    }
    return <ServerErrorView error={error} onBack={() => navigate('/', { replace: true })} />;
}
