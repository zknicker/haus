import type { ArtifactCreator, ArtifactCreatorSummary } from '@haus/api';
import type { HumanDirectory } from '../servers/human-identity.ts';

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

/** One choice in the "Created by" filter. */
export interface ArtifactCreatorOption {
    creator: ArtifactCreator;
    key: string;
    label: string;
}

/**
 * The "Created by" choices after Anyone: the viewer as "You", then Agents,
 * then other people; within a group, most recently active first (the
 * Server's order). An open filter whose creator has no live files keeps its
 * entry so the menu still names it.
 */
export function artifactCreatorOptions(
    summaries: readonly ArtifactCreatorSummary[],
    directory: ArtifactCreatorDirectory,
    selected: ArtifactCreator | null = null
): ArtifactCreatorOption[] {
    const creators = summaries.map((summary) => summary.creator);
    if (selected && !creators.some((creator) => creatorKey(creator) === creatorKey(selected))) {
        creators.push(selected);
    }
    const rank = (creator: ArtifactCreator) =>
        directory.isSelf(creator) ? 0 : creator.type === 'agent' ? 1 : 2;
    return creators
        .map((creator, index) => ({ creator, index }))
        .sort((a, b) => rank(a.creator) - rank(b.creator) || a.index - b.index)
        .map(({ creator }) => ({
            creator,
            key: creatorKey(creator),
            label: directory.name(creator),
        }));
}

export function creatorKey(creator: ArtifactCreator): string {
    return creator.type === 'agent' ? `agent:${creator.agent_id}` : `user:${creator.user_id}`;
}

/** The inverse of `creatorKey`; null for anything malformed, which reads as Anyone. */
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
