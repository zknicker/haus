import type { ModelConnectionAddInput, ModelConnectionReplaceCredentialInput } from '@haus/api';
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
    return {
        makeDefault: hausTrpc.modelConnections.makeDefault.useMutation({ onSuccess: refresh }),
        remove: hausTrpc.modelConnections.remove.useMutation({ onSuccess: refresh }),
        rename: hausTrpc.modelConnections.rename.useMutation({ onSuccess: refresh }),
        setWebSearch: hausTrpc.modelConnections.setWebSearch.useMutation({ onSuccess: refresh }),
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
