import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export interface RepoFolderTarget {
    computerId: string;
    serverId: string;
}

export function useComputerRepoFolders(target: RepoFolderTarget) {
    return hausTrpc.computer.repoFolders.useQuery(target, queryPolicy.syncedSnapshot);
}

export function useComputerRepoFolderStates(target: RepoFolderTarget, enabled: boolean) {
    return hausTrpc.computer.repoFolderStates.useQuery(target, {
        ...queryPolicy.computerSnapshot,
        enabled,
        retry: false,
    });
}

export function useAddRepoFolder(target: RepoFolderTarget) {
    const utils = hausTrpc.useUtils();
    return hausTrpc.computer.addRepoFolder.useMutation({
        onSuccess: () => {
            void utils.computer.repoFolders.invalidate(target);
            void utils.computer.repoFolderStates.invalidate(target);
        },
    });
}

export function useRemoveRepoFolder(target: RepoFolderTarget) {
    const utils = hausTrpc.useUtils();
    return hausTrpc.computer.removeRepoFolder.useMutation({
        onSuccess: () => {
            void utils.computer.repoFolders.invalidate(target);
            void utils.computer.repoFolderStates.invalidate(target);
        },
    });
}
