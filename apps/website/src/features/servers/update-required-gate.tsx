import { Button } from '@heroui/react';
import type { QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import {
    isUpdateRequiredError,
    type UpdateRequiredMode,
    updateRequiredMode,
} from '../../lib/app-update-required.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';

/**
 * Watches every Server query and mutation for the Server's protocol-mismatch
 * rejection. The gate covers the whole Haus App because `server.list` and the
 * open Server run on load, so a stale client trips it before showing product
 * data. Hosted browser tabs and the current thin desktop shell reload the
 * canonical Haus App. Older releases with a bundled renderer are
 * taught to install a desktop update.
 */
export function UpdateRequiredGate({
    children,
    queryClient,
}: React.PropsWithChildren<{ queryClient: QueryClient }>) {
    const mismatched = useProtocolMismatch(queryClient);

    if (!mismatched) {
        return children;
    }

    return <UpdateRequiredScreen mode={updateRequiredMode()} />;
}

function useProtocolMismatch(queryClient: QueryClient): boolean {
    const [mismatched, setMismatched] = React.useState(false);

    React.useEffect(() => {
        if (mismatched) {
            return;
        }

        const flagIfMismatch = (error: unknown) => {
            if (isUpdateRequiredError(error)) {
                setMismatched(true);
            }
        };

        const queryCache = queryClient.getQueryCache();
        const mutationCache = queryClient.getMutationCache();

        const unsubscribeQueries = queryCache.subscribe((event) => {
            if (event.type === 'updated' && event.query.state.status === 'error') {
                flagIfMismatch(event.query.state.error);
            }
        });
        const unsubscribeMutations = mutationCache.subscribe((event) => {
            if (event.type === 'updated' && event.mutation?.state.status === 'error') {
                flagIfMismatch(event.mutation.state.error);
            }
        });

        // Catch errors already present when this effect mounts.
        for (const query of queryCache.getAll()) {
            flagIfMismatch(query.state.error);
        }

        return () => {
            unsubscribeQueries();
            unsubscribeMutations();
        };
    }, [mismatched, queryClient]);

    return mismatched;
}

function UpdateRequiredScreen({ mode }: { mode: UpdateRequiredMode }) {
    return (
        <div className="bg-background flex min-h-screen items-center justify-center p-6">
            <div className="max-w-md space-y-4 text-center">
                <h1 className="text-foreground text-lg font-semibold">Update required</h1>
                {mode === 'reload' ? <ReloadBody /> : <DesktopUpdateBody />}
            </div>
        </div>
    );
}

function ReloadBody() {
    return (
        <>
            <p className="text-muted text-sm">
                Haus was updated. Reload this tab to continue with the current version.
            </p>
            <Button onPress={() => window.location.reload()}>Reload</Button>
        </>
    );
}

function DesktopUpdateBody() {
    const [checking, setChecking] = React.useState(false);

    const checkForUpdate = React.useCallback(async () => {
        setChecking(true);
        await getDesktopBridge()?.checkForUpdate();
    }, []);

    return (
        <>
            <p className="text-muted text-sm">
                This version of the Haus desktop app no longer matches the Server. Install the
                latest desktop update to continue.
            </p>
            <Button
                isPending={checking}
                onPress={() => {
                    void checkForUpdate();
                }}
            >
                {checking ? 'Checking…' : 'Check for updates'}
            </Button>
        </>
    );
}
