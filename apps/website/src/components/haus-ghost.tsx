import { GHOST_FIGURE } from './haus-ghost-figure.ts';
import { HausFigureMark, type HausMarkProps } from './haus-ghost-mark.tsx';

/**
 * The Haus ghost as vector artwork, tintable or in full app-icon color. Product
 * chrome draws `HausMascot`, which wears the seasonal costume; this is the
 * ghost itself, for the favicon renderer and anything that must never change.
 */
export function HausGhost(props: HausMarkProps) {
    return <HausFigureMark figure={GHOST_FIGURE} {...props} />;
}
