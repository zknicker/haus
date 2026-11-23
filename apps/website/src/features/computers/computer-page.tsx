import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { serverComputersRoute } from '../servers/server-routes.ts';
import { SettingsEmptyState } from '../settings/layout/settings-empty.tsx';
import { SettingsPageColumn } from '../settings/layout/settings-page-column.tsx';
import { PageTopbar } from '../shell/shell-topbar.tsx';
import { ComputerActionsMenu } from './computer-actions-menu.tsx';
import { ComputerDetail } from './computer-detail.tsx';
import { ComputerNotFound } from './computer-not-found.tsx';
import { ComputerRemoveDialog } from './computer-remove-dialog.tsx';
import type { ComputerUpdatePreviewState } from './computer-update-preview.tsx';

export function ComputerPage({
    computerId,
    serverId,
    serverSlug,
}: {
    computerId: string;
    serverId: string;
    serverSlug: string;
}) {
    const computers = useComputers(serverId);
    const navigate = useNavigate();
    const [removing, setRemoving] = React.useState(false);
    const [updatePreview, setUpdatePreview] = React.useState<ComputerUpdatePreviewState>('live');
    const computer = computers.data?.find((item) => item.id === computerId);

    return (
        <div className="flex h-full min-h-0 w-full">
            {computer ? (
                <PageTopbar>
                    <ComputerActionsMenu
                        computer={computer}
                        isPreview={updatePreview !== 'live'}
                        onRemove={() => setRemoving(true)}
                        serverId={serverId}
                    />
                </PageTopbar>
            ) : null}
            <main className="min-w-0 flex-1 overflow-y-auto">
                {computers.error && !computers.data ? (
                    <SettingsPageColumn width="table">
                        <SettingsEmptyState
                            description="Try opening this page again."
                            role="status"
                            title="Devices unavailable"
                        />
                    </SettingsPageColumn>
                ) : computers.data === undefined ? (
                    <div aria-busy="true">
                        <span className="sr-only">Loading device</span>
                    </div>
                ) : computer ? (
                    <ComputerDetail
                        computerId={computer.id}
                        onUpdatePreviewChange={setUpdatePreview}
                        serverId={serverId}
                        serverSlug={serverSlug}
                        updatePreview={updatePreview}
                    />
                ) : (
                    <ComputerNotFound computerId={computerId} serverId={serverId} />
                )}
            </main>
            {removing ? (
                <ComputerRemoveDialog
                    computerId={computerId}
                    onOpenChange={(open) => !open && setRemoving(false)}
                    onRemoved={() => navigate(serverComputersRoute(serverSlug), { replace: true })}
                    serverId={serverId}
                />
            ) : null}
        </div>
    );
}
