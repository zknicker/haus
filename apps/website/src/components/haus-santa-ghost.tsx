import { cn } from '../lib/utils.ts';
import { HausFigureMark, type HausMarkProps } from './haus-ghost-mark.tsx';
import { SANTA_GHOST_FIGURE } from './haus-santa-ghost-palette.ts';

/**
 * The Haus mark's Christmas costume: the ghost itself, in a glass nightcap.
 * Same props as `HausGhost`, so it drops into any slot the ghost fills.
 */
export function HausSantaGhost({ className, ...props }: HausMarkProps) {
    return (
        <HausFigureMark
            className={cn('haus-ghost--santa', className)}
            figure={SANTA_GHOST_FIGURE}
            {...props}
        />
    );
}
