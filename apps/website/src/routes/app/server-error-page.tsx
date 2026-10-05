import { Button, Disclosure, Surface } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import { AlertCircleIcon } from '@hugeicons/core-free-icons';
import { isRouteErrorResponse, useNavigate, useParams, useRouteError } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { serverRoute } from '../../features/servers/server-routes.ts';

export function ServerErrorPage() {
    const error = useRouteError();
    const navigate = useNavigate();
    const { slug = '' } = useParams();
    return <ServerErrorView error={error} onBack={() => navigate(serverRoute(slug))} />;
}

/**
 * The page-level error surface. The web's route boundary reads the route
 * error; a desktop tab's own boundary passes the caught error (tab routers
 * are not data routers, so `useRouteError` is unavailable there).
 */
export function ServerErrorView({ error, onBack }: { error: unknown; onBack: () => void }) {
    return (
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
            <div className="w-full max-w-lg">
                <EmptyState>
                    <EmptyState.Header>
                        <EmptyState.Media variant="icon">
                            <Icon className="text-danger" icon={AlertCircleIcon} />
                        </EmptyState.Media>
                        <EmptyState.Title>Oops, Something Went Wrong</EmptyState.Title>
                        <EmptyState.Description className="max-w-sm text-pretty">
                            This page ran into an unexpected problem. The rest of Haus is still
                            available.
                        </EmptyState.Description>
                    </EmptyState.Header>
                    <EmptyState.Content className="flex-row gap-2">
                        <Button onPress={() => window.location.reload()}>Try Again</Button>
                        <Button onPress={onBack} variant="outline">
                            Back to Chats
                        </Button>
                    </EmptyState.Content>
                </EmptyState>
                <Disclosure className="mt-6">
                    <Disclosure.Heading className="flex justify-center">
                        <Button size="sm" slot="trigger" variant="ghost">
                            Technical Details
                            <Disclosure.Indicator />
                        </Button>
                    </Disclosure.Heading>
                    <Disclosure.Content>
                        <Disclosure.Body className="pt-2">
                            <Surface className="rounded-2xl p-4" variant="secondary">
                                <pre className="whitespace-pre-wrap break-words font-mono text-muted text-xs">
                                    {describeRouteError(error)}
                                </pre>
                            </Surface>
                        </Disclosure.Body>
                    </Disclosure.Content>
                </Disclosure>
            </div>
        </main>
    );
}

export function describeRouteError(error: unknown) {
    if (isRouteErrorResponse(error)) {
        const detail =
            typeof error.data === 'string'
                ? error.data
                : error.data instanceof Error
                  ? error.data.message
                  : error.statusText;
        return `${error.status} ${detail || 'Request failed'}`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return 'No additional details are available.';
}
