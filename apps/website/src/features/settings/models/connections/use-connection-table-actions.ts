import type { ModelConnection, ModelProvider } from '@haus/api';
import * as React from 'react';
import { useModelConnectionEdits } from '../../../../hooks/servers/use-model-connections.ts';
import type { ConnectionTableActions } from './connection-columns.tsx';
import type { ConnectionAction } from './model-connection-model.ts';

export interface ConnectDialogTarget {
    provider: ModelProvider;
    replacing?: ModelConnection;
}

export function useConnectionTableActions({
    isOwner,
    now,
    serverId,
}: {
    isOwner: boolean;
    now: number;
    serverId: string;
}) {
    const edits = useModelConnectionEdits(serverId);
    const [dialog, setDialog] = React.useState<ConnectDialogTarget | null>(null);
    const [renaming, setRenaming] = React.useState<ModelConnection | null>(null);
    const target = (connection: ModelConnection) => ({ connectionId: connection.id, serverId });
    const actions: ConnectionTableActions = {
        isOwner,
        now,
        onAction: (connection, action) => {
            const run: Record<ConnectionAction, () => void> = {
                'make-default': () => edits.makeDefault.mutate(target(connection)),
                reconnect: () =>
                    setDialog({ provider: connection.provider, replacing: connection }),
                remove: () => edits.remove.mutate(target(connection)),
                rename: () => setRenaming(connection),
            };
            run[action]();
        },
        onEnabled: (connection, enabled) =>
            edits.setEnabled.mutate({ ...target(connection), enabled }),
        onWebSearch: (connection, enabled) =>
            edits.setWebSearch.mutate({ ...target(connection), enabled }),
        savingEnabled: edits.setEnabled.isPending,
        savingWebSearch: edits.setWebSearch.isPending,
    };
    const failedEdit = [edits.makeDefault, edits.remove, edits.setEnabled, edits.setWebSearch].find(
        (mutation) => mutation.error
    )?.error;
    return { actions, dialog, failedEdit, renaming, setDialog, setRenaming };
}
