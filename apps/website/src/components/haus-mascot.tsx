import { useColorThemeDefinition } from '../hooks/shell/use-color-theme.ts';
import { HausGhost } from './haus-ghost.tsx';
import type { HausMarkProps } from './haus-ghost-mark.tsx';
import { HausPumpkin } from './haus-pumpkin.tsx';

/**
 * The Haus mascot wherever product chrome shows it, in the costume the color
 * theme's definition names. The one place the costume is chosen, so no call
 * site carries the theme check.
 */
export function HausMascot(props: HausMarkProps) {
    const { mascot } = useColorThemeDefinition();
    return mascot === 'pumpkin' ? <HausPumpkin {...props} /> : <HausGhost {...props} />;
}
