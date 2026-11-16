import type { ServerMember } from '@haus/api/membership';

/**
 * The one way a human is named. A member who has never opened the App has no
 * profile yet, so the id's tail stands in until their first sign-in seeds one.
 * Every surface must read names through here or they drift apart.
 */
export function humanDisplayName(member: Pick<ServerMember, 'displayName' | 'userId'>): string {
    return member.displayName ?? `Human ${member.userId.slice(-6)}`;
}

export function humanHandle(member: Pick<ServerMember, 'handle'>): null | string {
    return member.handle ? `@${member.handle}` : null;
}

/**
 * Names and faces for humans a surface only knows by id — transcript authors,
 * claim assignees, DM peers. Ids outside the directory still resolve, so a
 * departed member reads as a stable label rather than a blank.
 */
export interface HumanDirectory {
    avatarUrl(userId: null | string): null | string;
    handle(userId: null | string): null | string;
    isSelf(userId: null | string): boolean;
    member(userId: null | string): ServerMember | null;
    name(userId: null | string): string;
}

export function humanDirectory(
    members: readonly ServerMember[],
    viewerUserId?: null | string
): HumanDirectory {
    const byId = new Map(members.map((member) => [member.userId, member]));
    const find = (userId: null | string) => (userId ? (byId.get(userId) ?? null) : null);

    return {
        avatarUrl: (userId) => find(userId)?.avatarUrl ?? null,
        isSelf: (userId) => Boolean(userId) && userId === viewerUserId,
        handle: (userId) => {
            const member = find(userId);
            return member ? humanHandle(member) : null;
        },
        member: find,
        name: (userId) => {
            const member = find(userId);
            if (member) {
                return humanDisplayName(member);
            }
            return userId ? `Human ${userId.slice(-6)}` : 'Human';
        },
    };
}
