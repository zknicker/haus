import * as React from 'react';
import { useColorThemeDefinition } from '../../hooks/shell/use-color-theme.ts';
import { type SkyMoonLayout, startSkyLoop } from './halloween-sky-loop.ts';

/**
 * Where the sky is drawn: behind the desktop window band's sidebar-width lead,
 * or at the top of the web sidebar behind its titlebar strip.
 */
export type HalloweenSkyPlacement = 'band' | 'sidebar';

/**
 * The moon sits right of centre and left of the trailing controls: the band
 * lead's Back and Forward, or the web strip's Settings gear.
 */
const moonLayouts: Record<HalloweenSkyPlacement, SkyMoonLayout> = {
    band: { inset: 104, radius: 14, y: 17 },
    sidebar: { inset: 74, radius: 14, y: 17 },
};

/**
 * The `moonlit-sky` scene: a dim moon veiled by slowly drifting clouds.
 * Mounted only when the color theme's definition names it, so a theme without
 * a scene pays nothing. Pure art: hidden from assistive tech, no pointer
 * events, and no `app-region` of its own (desktop-window-layout.md → Window drag).
 */
export function HalloweenSky({ placement }: { placement: HalloweenSkyPlacement }) {
    const { scene } = useColorThemeDefinition();
    if (scene !== 'moonlit-sky') {
        return null;
    }
    return <HalloweenSkyCanvas placement={placement} />;
}

function HalloweenSkyCanvas({ placement }: { placement: HalloweenSkyPlacement }) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const [unavailable, setUnavailable] = React.useState(false);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const stop = startSkyLoop(canvas, moonLayouts[placement]);
        if (!stop) {
            // No WebGL: render nothing rather than an empty box.
            setUnavailable(true);
            return;
        }
        return stop;
    }, [placement]);

    if (unavailable) {
        return null;
    }
    return (
        // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas with no tabIndex takes no focus; the sky is decoration.
        <canvas
            aria-hidden="true"
            className={`halloween-sky halloween-sky--${placement}`}
            ref={canvasRef}
        />
    );
}
