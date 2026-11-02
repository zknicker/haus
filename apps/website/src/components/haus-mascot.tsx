import type { ComponentType } from 'react';
import { useColorThemeDefinition } from '../hooks/shell/use-color-theme.ts';
import type { ColorThemeDefinition } from '../lib/color-themes.ts';
import { HausGhost } from './haus-ghost.tsx';
import type { HausMarkProps } from './haus-ghost-mark.tsx';
import { HausPumpkin } from './haus-pumpkin.tsx';
import { HausSantaGhost } from './haus-santa-ghost.tsx';

/**
 * The Haus mascot wherever product chrome shows it, in the costume the color
 * theme's definition names. The one place the costume is chosen, so no call
 * site carries the theme check.
 */
export function HausMascot(props: HausMarkProps) {
    const Costume = costumes[useColorThemeDefinition().mascot];
    return <Costume {...props} />;
}

/** Every costume a definition can name; a new one fails to compile until it is drawn. */
const costumes: Readonly<Record<ColorThemeDefinition['mascot'], ComponentType<HausMarkProps>>> = {
    ghost: HausGhost,
    pumpkin: HausPumpkin,
    santa: HausSantaGhost,
};
