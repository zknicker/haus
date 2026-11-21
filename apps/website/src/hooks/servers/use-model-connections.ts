import type {
    ModelConnection,
    ModelConnectionAddInput,
    ModelConnectionReplaceCredentialInput,
    ModelConnectionsRead,
} from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export type ModelCredentialSave =
    | Omit<ModelConnectionAddInput, 'serverId'>
    | Omit<ModelConnectionReplaceCredentialInput, 'serverId'>;

export function useModelConnections(serverId: string, { enabled = true } = {}) {
    return hausTrpc.modelConnections.list.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, enabled }
    );
}

export function useModelConnectionEdits(serverId: string) {
    const utils = hausTrpc.useUtils();
    const refresh = () => {
        void utils.modelConnections.list.invalidate({ serverId });
    };
    const resets = new Map<SwitchEdit | 'makeDefault' | 'remove', () => void>();
    const clearOthers = (keep: SwitchEdit | 'makeDefault' | 'remove') => {
        for (const [name, reset] of resets) {
            if (name !== keep) {
                reset();
            }
        }
    };
    const optimisticSwitch = (edit: SwitchEdit) => ({
        onError: (
            _error: unknown,
            _input: unknown,
            context: { previous: ModelConnectionsRead | undefined } | undefined
        ) => {
            if (context?.previous) {
                utils.modelConnections.list.setData({ serverId }, context.previous);
            }
            refresh();
        },
        onMutate: async ({ connectionId, enabled }: { connectionId: string; enabled: boolean }) => {
            clearOthers(edit);
            await utils.modelConnections.list.cancel({ serverId });
            const previous = utils.modelConnections.list.getData({ serverId });
            utils.modelConnections.list.setData({ serverId }, (read) =>
                read
                    ? withConnection(read, connectionId, (connection) => ({
                          ...connection,
                          [switchFields[edit]]: enabled,
                      }))
                    : read
            );
            return { previous };
        },
        onSuccess: (saved: ModelConnection) => {
            utils.modelConnections.list.setData({ serverId }, (read) =>
                read ? withConnection(read, saved.id, () => saved) : read
            );
        },
    });
    const makeDefault = hausTrpc.modelConnections.makeDefault.useMutation({
        onMutate: () => clearOthers('makeDefault'),
        onSuccess: refresh,
    });
    const remove = hausTrpc.modelConnections.remove.useMutation({
        onMutate: () => clearOthers('remove'),
        onSuccess: refresh,
    });
    const setEnabled = hausTrpc.modelConnections.setEnabled.useMutation(
        optimisticSwitch('setEnabled')
    );
    const setWebSearch = hausTrpc.modelConnections.setWebSearch.useMutation(
        optimisticSwitch('setWebSearch')
    );
    resets.set('makeDefault', makeDefault.reset);
    resets.set('remove', remove.reset);
    resets.set('setEnabled', setEnabled.reset);
    resets.set('setWebSearch', setWebSearch.reset);
    return {
        makeDefault,
        remove,
        rename: hausTrpc.modelConnections.rename.useMutation({ onSuccess: refresh }),
        setEnabled,
        setWebSearch,
    };
}

export function useSaveModelCredential(serverId: string) {
    const utils = hausTrpc.useUtils();
    const [isPending, setPending] = React.useState(false);

    const save = (input: ModelCredentialSave) => {
        setPending(true);
        const saving =
            'connectionId' in input
                ? utils.client.modelConnections.replaceCredential.mutate({ ...input, serverId })
                : utils.client.modelConnections.add.mutate({ ...input, serverId });
        return saving.then(
            (connection) => {
                setPending(false);
                void utils.modelConnections.list.invalidate({ serverId });
                return connection;
            },
            (cause: unknown) => {
                setPending(false);
                throw cause;
            }
        );
    };

    return { isPending, save };
}

type SwitchEdit = 'setEnabled' | 'setWebSearch';

const switchFields = {
    setEnabled: 'enabled',
    setWebSearch: 'webSearch',
} as const satisfies Record<SwitchEdit, keyof ModelConnection>;

function withConnection(
    read: ModelConnectionsRead,
    connectionId: string,
    change: (connection: ModelConnection) => ModelConnection
) {
    return {
        ...read,
        connections: read.connections.map((connection) =>
            connection.id === connectionId ? change(connection) : connection
        ),
    };
}
