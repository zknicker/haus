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

export function useModelConnections(serverId: string) {
    return hausTrpc.modelConnections.list.useQuery({ serverId }, queryPolicy.syncedSnapshot);
}

export function useModelConnectionEdits(serverId: string) {
    const utils = hausTrpc.useUtils();
    const refresh = () => {
        void utils.modelConnections.list.invalidate({ serverId });
    };
    const makeDefault = hausTrpc.modelConnections.makeDefault.useMutation({
        onMutate: () => {
            remove.reset();
            setWebSearch.reset();
        },
        onSuccess: refresh,
    });
    const remove = hausTrpc.modelConnections.remove.useMutation({
        onMutate: () => {
            makeDefault.reset();
            setWebSearch.reset();
        },
        onSuccess: refresh,
    });
    const setWebSearch = hausTrpc.modelConnections.setWebSearch.useMutation({
        onMutate: async ({ connectionId, enabled }) => {
            makeDefault.reset();
            remove.reset();
            await utils.modelConnections.list.cancel({ serverId });
            const previous = utils.modelConnections.list.getData({ serverId });
            utils.modelConnections.list.setData({ serverId }, (read) =>
                read
                    ? withConnection(read, connectionId, (connection) => ({
                          ...connection,
                          webSearch: enabled,
                      }))
                    : read
            );
            return { previous };
        },
        onError: (_error, _variables, context) => {
            if (context?.previous) {
                utils.modelConnections.list.setData({ serverId }, context.previous);
            }
            refresh();
        },
        onSuccess: (saved) => {
            utils.modelConnections.list.setData({ serverId }, (read) =>
                read ? withConnection(read, saved.id, () => saved) : read
            );
        },
    });
    return {
        makeDefault,
        remove,
        rename: hausTrpc.modelConnections.rename.useMutation({ onSuccess: refresh }),
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
