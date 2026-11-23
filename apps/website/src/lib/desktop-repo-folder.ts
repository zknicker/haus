import { getDesktopBridge } from './desktop-bridge.ts';

export type RepoFolderPick = { path: string; status: 'picked' } | { status: 'canceled' };

export function canPickRepoFolder() {
    return typeof getDesktopBridge()?.pickRepoFolder === 'function';
}

export async function pickRepoFolder() {
    const pick = getDesktopBridge()?.pickRepoFolder;
    return parseRepoFolderPick(pick ? await pick() : null);
}

export async function readLocalComputerId(serverId: string) {
    const read = getDesktopBridge()?.localComputerId;
    return parseLocalComputerId(read ? await read(serverId) : null);
}

export function parseRepoFolderPick(reply: unknown) {
    if (
        typeof reply === 'object' &&
        reply !== null &&
        'status' in reply &&
        reply.status === 'picked' &&
        'path' in reply &&
        typeof reply.path === 'string' &&
        reply.path.startsWith('/')
    ) {
        return { path: reply.path, status: 'picked' } satisfies RepoFolderPick;
    }
    return { status: 'canceled' } satisfies RepoFolderPick;
}

export function parseLocalComputerId(reply: unknown) {
    return typeof reply === 'string' && reply.length > 0 ? reply : null;
}
