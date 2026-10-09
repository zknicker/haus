import type { Agent, ChatMessage } from '@haus/api';
import * as React from 'react';
import type { TranscriptActor, TranscriptActorProfile } from '../../chats/transcript-contract.ts';
import type { HumanDirectory } from '../human-identity.ts';

type IdentifiedAuthor = Extract<ChatMessage['author'], { kind: 'agent' | 'human' }>;
type AuthorProfile = NonNullable<IdentifiedAuthor['profile']>;
interface ProfileSource {
    id: string;
    kind: 'agent' | 'human';
    profile: AuthorProfile;
}

/**
 * Names and faces for the actors a transcript renders. The returned resolver
 * keeps its identity across ordinary message refetches so the transcript's
 * render context — and therefore every memoized row — stays stable.
 */
export function useResolveActorProfile({
    agentsById,
    humans,
    messages,
}: {
    agentsById: ReadonlyMap<string, Agent>;
    humans: HumanDirectory;
    messages: readonly ChatMessage[];
}) {
    const historicalProfiles = useHistoricalActorProfiles(messages, humans);

    return React.useCallback(
        (actor: TranscriptActor): TranscriptActorProfile | null => {
            if (!actor) {
                return null;
            }

            if (actor.kind === 'agent') {
                const agent = agentsById.get(actor.id);

                return agent
                    ? liveAgentActorProfile(agent)
                    : (historicalProfiles.get(`agent:${actor.id}`) ?? null);
            }

            const member = humans.member(actor.id);
            const historical = historicalProfiles.get(`human:${actor.id}`);

            if (!member && historical) {
                return historical;
            }

            return {
                avatarUrl: humans.avatarUrl(actor.id),
                deleted: false,
                id: actor.id,
                isSelf: humans.isSelf(actor.id),
                kind: actor.kind,
                name: humans.name(actor.id),
                availability: { kind: 'none' },
            };
        },
        [agentsById, historicalProfiles, humans]
    );
}

export function liveAgentActorProfile(agent: Agent): TranscriptActorProfile {
    return {
        avatarUrl: agent.avatarUrl,
        deleted: false,
        id: agent.id,
        isSelf: false,
        kind: 'agent',
        name: agent.displayName,
        availability: { kind: 'live', serverId: agent.serverId },
    };
}

/**
 * An author who has since left the Server is only nameable from the messages
 * they wrote. Structural sharing keeps each message's author profile object
 * identical across refetches, so this map changes identity only when the set
 * of remembered authors actually changes — not on every new message.
 */
function useHistoricalActorProfiles(messages: readonly ChatMessage[], humans: HumanDirectory) {
    const cacheRef = React.useRef<{
        humans: HumanDirectory | null;
        profiles: ReadonlyMap<string, TranscriptActorProfile>;
        sources: ReadonlyMap<string, ProfileSource>;
    }>({ humans: null, profiles: new Map(), sources: new Map() });

    return React.useMemo(() => {
        const sources = new Map<string, ProfileSource>();

        for (const message of messages) {
            const author = message.author;

            if (!author.profile) {
                continue;
            }

            const id = author.kind === 'agent' ? author.agentId : author.userId;

            sources.set(`${author.kind}:${id}`, { id, kind: author.kind, profile: author.profile });
        }

        const cache = cacheRef.current;

        if (cache.humans === humans && areSameProfileSources(cache.sources, sources)) {
            return cache.profiles;
        }

        const profiles = new Map<string, TranscriptActorProfile>();

        for (const [key, source] of sources) {
            profiles.set(
                key,
                source.kind === 'agent'
                    ? {
                          avatarUrl: source.profile.avatarUrl,
                          deleted: source.profile.deleted,
                          id: source.id,
                          isSelf: false,
                          kind: 'agent',
                          name: source.profile.displayName,
                          availability: { kind: 'none' },
                      }
                    : {
                          avatarUrl: source.profile.avatarUrl,
                          deleted: source.profile.deleted,
                          id: source.id,
                          isSelf: humans.isSelf(source.id),
                          kind: 'participant',
                          name: source.profile.displayName,
                          availability: { kind: 'none' },
                      }
            );
        }

        cacheRef.current = { humans, profiles, sources };

        return profiles;
    }, [humans, messages]);
}

function areSameProfileSources(
    previous: ReadonlyMap<string, ProfileSource>,
    next: ReadonlyMap<string, ProfileSource>
) {
    if (previous.size !== next.size) {
        return false;
    }

    for (const [key, source] of next) {
        if (previous.get(key)?.profile !== source.profile) {
            return false;
        }
    }

    return true;
}
