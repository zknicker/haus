/** Where the App reads avatar bytes. Ids are opaque, so the route is public. */
export const avatarRoutePrefix = '/api/avatars';

/** The `<img src>` for one stored avatar, or nothing when none is set. */
export function avatarUrlFor(avatarId: null | string): null | string {
    return avatarId ? `${avatarRoutePrefix}/${avatarId}` : null;
}

/**
 * The avatar as an absolute URL on the App origin, for surfaces outside the
 * App such as iPhone push; nothing when none is set.
 */
export function absoluteAvatarUrlFor(avatarId: null | string, appOrigin: string): null | string {
    const path = avatarUrlFor(avatarId);
    return path ? new URL(path, appOrigin).toString() : null;
}
