import type { ArtifactCreator, ArtifactCreatorSummary, ArtifactMetadata } from '@haus/api';
import type { HumanDirectory } from '../servers/human-identity.ts';
import { type ArtifactFolderTone, artifactFolderTones } from './icons/artifact-folder-icon.tsx';

/** Who made what, named the way every other surface names them. */
export interface ArtifactCreatorDirectory {
    /** The identity mark: the creator's real name (never "You") and uploaded image. */
    avatar(creator: ArtifactCreator): { name: string; src: string | null };
    isSelf(creator: ArtifactCreator): boolean;
    /** "You" for the viewer, else the Agent's or person's display name. */
    name(creator: ArtifactCreator): string;
}

export function artifactCreatorDirectory(
    agents: readonly { avatarUrl: string | null; displayName: string; id: string }[],
    humans: HumanDirectory
): ArtifactCreatorDirectory {
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    const isSelf = (creator: ArtifactCreator) =>
        creator.type === 'user' && humans.isSelf(creator.user_id);
    const agentName = (agentId: string) => byId.get(agentId)?.displayName ?? 'Removed Agent';
    return {
        avatar: (creator) =>
            creator.type === 'agent'
                ? {
                      name: agentName(creator.agent_id),
                      src: byId.get(creator.agent_id)?.avatarUrl ?? null,
                  }
                : { name: humans.name(creator.user_id), src: humans.avatarUrl(creator.user_id) },
        isSelf,
        name: (creator) => {
            if (creator.type === 'agent') {
                return agentName(creator.agent_id);
            }
            return isSelf(creator) ? 'You' : humans.name(creator.user_id);
        },
    };
}

/** A library folder: everything, or one creator's files. Storage stays flat. */
export interface ArtifactFolder {
    count: number;
    /** Null for the All folder. */
    creator: ArtifactCreator | null;
    key: string;
    label: string;
    previews: ArtifactMetadata[];
    tone: ArtifactFolderTone;
}

export const allFolderKey = 'all';

/**
 * All first, then the viewer's own files as "Yours", then Agents, then other
 * people; within a group, most recently active first (the Server's order).
 */
export function artifactFolders(
    summaries: readonly ArtifactCreatorSummary[],
    directory: ArtifactCreatorDirectory
): ArtifactFolder[] {
    const tones = creatorTones(summaries);
    const folders = summaries.map((summary) => creatorFolder(summary, directory, tones));
    const rank = (folder: ArtifactFolder) =>
        folder.creator && directory.isSelf(folder.creator)
            ? 0
            : folder.creator?.type === 'agent'
              ? 1
              : 2;
    const ordered = folders
        .map((folder, index) => ({ folder, index }))
        .sort((a, b) => rank(a.folder) - rank(b.folder) || a.index - b.index)
        .map(({ folder }) => folder);
    return [allFolder(summaries), ...ordered];
}

/** A creator folder's name: "Yours" for the viewer, else the creator's display name. */
export function artifactFolderLabel(
    creator: ArtifactCreator,
    directory: ArtifactCreatorDirectory
): string {
    return directory.isSelf(creator) ? 'Yours' : directory.name(creator);
}

export function creatorKey(creator: ArtifactCreator): string {
    return creator.type === 'agent' ? `agent:${creator.agent_id}` : `user:${creator.user_id}`;
}

/** The inverse of `creatorKey`; null for anything malformed, which reads as All. */
export function parseCreatorKey(key: string | null): ArtifactCreator | null {
    const separator = key?.indexOf(':') ?? -1;
    if (!key || separator < 1 || separator === key.length - 1) {
        return null;
    }
    const type = key.slice(0, separator);
    const id = key.slice(separator + 1);
    if (type === 'agent') {
        return { agent_id: id, type };
    }
    return type === 'user' ? { type, user_id: id } : null;
}

/**
 * Tints dealt in creator-key order, not activity order, so a given set of
 * creators keeps its colors across reads and no two share a tint until there
 * are more creators than tints. Neutral is left for All.
 */
function creatorTones(
    summaries: readonly ArtifactCreatorSummary[]
): Map<string, ArtifactFolderTone> {
    const tinted = artifactFolderTones.filter((tone) => tone !== 'neutral');
    const keys = [...new Set(summaries.map((summary) => creatorKey(summary.creator)))].sort();
    return new Map(keys.map((key, index) => [key, tinted[index % tinted.length] ?? 'blue']));
}

function creatorFolder(
    summary: ArtifactCreatorSummary,
    directory: ArtifactCreatorDirectory,
    tones: ReadonlyMap<string, ArtifactFolderTone>
): ArtifactFolder {
    const key = creatorKey(summary.creator);
    return {
        count: summary.artifact_count,
        creator: summary.creator,
        key,
        label: artifactFolderLabel(summary.creator, directory),
        previews: summary.previews,
        tone: tones.get(key) ?? 'blue',
    };
}

function allFolder(summaries: readonly ArtifactCreatorSummary[]): ArtifactFolder {
    const previews = summaries
        .flatMap((summary) => summary.previews)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 3);
    return {
        count: summaries.reduce((total, summary) => total + summary.artifact_count, 0),
        creator: null,
        key: allFolderKey,
        label: 'All files',
        previews,
        tone: 'neutral',
    };
}
