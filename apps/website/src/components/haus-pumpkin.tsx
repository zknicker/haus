import { cn } from '../lib/utils.ts';
import { HausFigureMark, type HausMarkProps } from './haus-ghost-mark.tsx';
import { PUMPKIN_FIGURE } from './haus-pumpkin-palette.ts';

/**
 * The Haus mark's Halloween costume: the ghost's eyes on a glass pumpkin, in
 * the ghost's own box, glass, and drift. Same props as `HausGhost`, so it drops
 * into any slot the ghost fills.
 */
export function HausPumpkin({ className, ...props }: HausMarkProps) {
    return (
        <HausFigureMark
            className={cn('haus-ghost--pumpkin', className)}
            figure={PUMPKIN_FIGURE}
            {...props}
        />
    );
}
