import { type ArtifactFolderEntry, artifactPathKey } from '@haus/api';

export type DriveArea =
    | { kind: 'haus'; root: 'haus' }
    | { kind: 'project'; key: string; root: string }
    | { kind: 'agent'; handle: string; root: string };

export type DriveShelf = 'agents' | 'projects';

export type DrivePlace =
    | { kind: 'root' }
    | { kind: 'shelf'; shelf: DriveShelf }
    | { kind: 'area'; area: DriveArea; folder: string }
    | { kind: 'legacy'; folder: string };

export interface DriveFolder {
    file_count: number;
    name: string;
    path: string;
    updated_at: string | null;
}

export const driveRootFolders = [
    { label: 'Haus', path: 'haus' },
    { label: 'Projects', path: 'projects' },
    { label: 'Captains', path: 'agents' },
] as const;

export const driveRootLabel = 'Drive';

export function drivePlace(folder: string) {
    if (folder === '') {
        const place: DrivePlace = { kind: 'root' };
        return place;
    }
    const [first = '', second, ...rest] = folder.split('/');
    const top = artifactPathKey(first);
    if (top === 'haus') {
        const place: DrivePlace = { area: { kind: 'haus', root: 'haus' }, folder, kind: 'area' };
        return place;
    }
    if (top !== 'projects' && top !== 'agents') {
        const place: DrivePlace = { folder, kind: 'legacy' };
        return place;
    }
    if (second === undefined) {
        const place: DrivePlace = { kind: 'shelf', shelf: top };
        return place;
    }
    const root = `${first}/${second}`;
    const area: DriveArea =
        top === 'projects'
            ? { key: second, kind: 'project', root }
            : { handle: second, kind: 'agent', root };
    const place: DrivePlace = { area, folder: rest.length === 0 ? root : folder, kind: 'area' };
    return place;
}

export function driveAcceptsFiles(folder: string) {
    const place = drivePlace(folder);
    return place.kind === 'area' || place.kind === 'legacy';
}

export function driveFolderLabel(path: string, agentName: (handle: string) => string | undefined) {
    if (path === '') {
        return driveRootLabel;
    }
    const top = driveRootFolders.find(
        (entry) => artifactPathKey(entry.path) === artifactPathKey(path)
    );
    if (top) {
        return top.label;
    }
    const place = drivePlace(path);
    if (place.kind === 'area' && place.area.kind === 'agent' && place.folder === place.area.root) {
        return agentName(place.area.handle) ?? place.area.handle;
    }
    return path.slice(path.lastIndexOf('/') + 1);
}

export function driveRootTiles(listed: readonly ArtifactFolderEntry[]) {
    return driveRootFolders.map((entry) => folderOrEmpty(listed, entry.path, entry.label));
}

export function driveAgentTiles(
    listed: readonly ArtifactFolderEntry[],
    agents: readonly { displayName: string; handle: string }[]
) {
    const tiles = agents.map((agent) =>
        folderOrEmpty(listed, `agents/${agent.handle}`, agent.displayName)
    );
    const claimed = new Set(tiles.map((tile) => artifactPathKey(tile.path)));
    const unclaimed: DriveFolder[] = listed
        .filter((entry) => !claimed.has(artifactPathKey(entry.path)))
        .map((entry) => ({ ...entry }));
    return [...tiles, ...unclaimed];
}

export function driveFolderTiles(
    folder: string,
    listed: readonly ArtifactFolderEntry[],
    agents: readonly { displayName: string; handle: string }[]
) {
    const place = drivePlace(folder);
    if (place.kind === 'root') {
        const tops = new Set(driveRootFolders.map((entry) => artifactPathKey(entry.path)));
        const legacy = listed.filter((entry) => !tops.has(artifactPathKey(entry.path)));
        const tiles: DriveFolder[] = [...driveRootTiles(listed), ...legacy];
        return tiles;
    }
    if (place.kind === 'shelf' && place.shelf === 'agents') {
        return driveAgentTiles(listed, agents);
    }
    const tiles: DriveFolder[] = [...listed];
    return tiles;
}

export function driveFolderIsFixed(path: string) {
    const place = drivePlace(path);
    return (
        place.kind === 'shelf' ||
        (place.kind === 'area' &&
            artifactPathKey(place.folder) === artifactPathKey(place.area.root))
    );
}

export function driveAgentName(agents: readonly { displayName: string; handle: string }[]) {
    return (handle: string) =>
        agents.find((agent) => artifactPathKey(agent.handle) === artifactPathKey(handle))
            ?.displayName;
}

function folderOrEmpty(listed: readonly ArtifactFolderEntry[], path: string, name: string) {
    const found = listed.find((entry) => artifactPathKey(entry.path) === artifactPathKey(path));
    const folder: DriveFolder = found
        ? { ...found, name }
        : { file_count: 0, name, path, updated_at: null };
    return folder;
}
