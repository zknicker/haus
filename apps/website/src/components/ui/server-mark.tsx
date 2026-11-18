import { cn } from '../../lib/utils.ts';
import { identityMarkRadius } from './entity-avatar.tsx';

/**
 * A Server's mark: the accent-coloured counterpart to the EntityAvatar people
 * and Agents wear. Its radius comes off the same box/radius pairing they use,
 * so it tracks them at every scale step — a circle at the roomy end, a rounded
 * square at the sharp end — instead of pinning itself to one radius step and
 * drifting rounder than its neighbours as the box shrinks. One initial keeps
 * the glyph centred and legible at this size; two crowd it.
 */
const markSize = 24;

export function ServerMark({ className, name }: { className?: string; name: string }) {
    return (
        <span
            aria-hidden="true"
            // Fixed 24px so the Server reads at the same scale as the Agent
            // avatars below it, independent of sidebar density.
            className={cn(
                'bg-accent text-accent-foreground flex shrink-0 items-center justify-center text-xs font-semibold',
                className
            )}
            style={{
                borderRadius: identityMarkRadius(markSize),
                height: markSize,
                width: markSize,
            }}
        >
            {serverInitial(name)}
        </span>
    );
}

export function serverInitial(name: string): string {
    return (
        [...name.trim()].find((character) => /\p{L}|\p{N}/u.test(character))?.toUpperCase() ?? '?'
    );
}
