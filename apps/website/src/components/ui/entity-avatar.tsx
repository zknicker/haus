import { Avatar } from '@heroui/react';
import * as React from 'react';

export type EntityAvatarSize = 'lg' | 'md' | 'sm';

export interface EntityAvatarProps {
    className?: string;
    name: string;
    /**
     * A stock step, or an exact pixel box for rail-scale slots (sidebar rows,
     * mention chips, thread reply previews) below HeroUI's 32px floor.
     */
    size?: EntityAvatarSize | number;
    src?: string | null;
}

/**
 * The one identity mark in the app — agents and people are identical here by
 * design, and every surface from the rail to a profile page renders this so
 * the shape stays consistent. Stock HeroUI `Avatar`: `sm` 32px, `md` 40px,
 * `lg` 48px. Uploaded image when there is one, initials otherwise. Memoized:
 * its props are primitives, and the marks around it (an Agent's presence dot)
 * re-render on every availability flip.
 */
export const EntityAvatar = React.memo(function EntityAvatar({
    className,
    name,
    size = 'md',
    src,
}: EntityAvatarProps): React.ReactElement {
    // HeroUI sizes the avatar in CSS, so an exact box has to come through
    // inline style — the one place the design system reaches past the variant.
    const exact = typeof size === 'number';
    const preset = exact ? exactSizePreset(size) : size;

    return (
        <Avatar
            className={className}
            // The image status lives in the root and, patched, survives a hidden
            // tab's effect teardown, so a new or removed image starts a new root.
            key={src ?? ''}
            size={preset}
            style={
                exact
                    ? {
                          borderRadius: identityMarkRadius(size),
                          fontSize: Math.max(8, Math.round(size * 0.42)),
                          height: size,
                          width: size,
                      }
                    : undefined
            }
        >
            {src ? <Avatar.Image alt={`${name} avatar`} src={src} /> : null}
            <Avatar.Fallback>{getEntityInitials(name)}</Avatar.Fallback>
        </Avatar>
    );
});

/**
 * HeroUI pairs each preset's box with its own radius step — `sm` is 32px at
 * `--radius * 2`, `lg` is 48px at `* 3` — which is the same proportion, so the
 * presets stay equally round at any radius. Forcing a box without re-pairing
 * the radius leaves half that rule dangling: the preset's fixed radius against
 * a smaller box reads rounder (a 20px rail avatar at `sm` was 40% round beside
 * a 32px one at 25%), and against a larger box reads squarer (a 64px profile
 * avatar was a squircle while everything around it was a circle).
 *
 * So derive the radius from the same token, normalized to the `sm` pairing.
 * Exported because every fixed-box identity mark — the Server mark, the channel
 * icon box — has to sit on this same curve or it drifts out of step with the
 * avatars beside it.
 */
export function identityMarkRadius(size: number): string {
    return `calc(var(--radius) * ${size / 16})`;
}

function exactSizePreset(size: number): EntityAvatarSize {
    if (size >= 48) {
        return 'lg';
    }
    if (size > 32) {
        return 'md';
    }
    return 'sm';
}

/** One initial for a single-word name is too thin to read; two letters is the floor. */
export function getEntityInitials(name: string): string {
    const parts = name
        .trim()
        .split(/\s+/)
        .filter((part) => part.length > 0);

    if (parts.length === 0) {
        return '?';
    }

    if (parts.length === 1) {
        return parts[0]?.slice(0, 2).toUpperCase() ?? '?';
    }

    return `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
}
