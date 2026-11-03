import * as React from 'react';
import { useResolvedThemeOptional } from '../../../components/theme-provider.tsx';
import { useColorThemeDefinition } from '../../../hooks/shell/use-color-theme.ts';
import { useRooflineSnow } from '../../../hooks/shell/use-roofline-snow.ts';
import { armLightsOn } from './lights-on.ts';
import type { RooflinePlacement } from './measure.ts';
import { type Roofline, startRoofline } from './scene.ts';

/**
 * The `snowy-roofline` scene: a strip of painted snow along the very top edge
 * of the window, Toy Box C9 bulbs hanging from under it, a holly sprig, and a
 * light flurry falling behind it all. Mounted only when the color theme's
 * definition names it, so a theme without it pays nothing.
 *
 * Pure art: hidden from assistive tech, no pointer events, and no
 * `app-region` of its own (shell.css → the one window-drag contract). It sits
 * behind every band control (christmas-decorations.css), so it never adds a
 * drag or no-drag box.
 *
 * - `band`: the desktop window band, from the window's left edge through the
 *   sidebar lead and across the tab rows. The snow runs over the lead and
 *   drapes in front of the tabs; bulbs start past the lead and leave room for
 *   every tab, so the tabs tuck under the eave.
 * - `sidebar`: the web, which has no band. The roofline runs along the top of
 *   the sidebar, the app's top-left edge, behind its titlebar strip, as the
 *   Halloween sky does; bulbs hang only in the run between the Haus mark and
 *   the Settings gear. The main column's topbar gets none: its breadcrumbs and
 *   actions change with every page, so no stretch of it is reliably clear.
 *
 * The bulbs light up once per window launch (lights-on.ts). Switching a
 * Christmas theme on from another theme lights them up again; switching
 * between the Christmas themes, the Snow, or the placement does not.
 */
export function ThemeRoofline({ placement }: { placement: RooflinePlacement }) {
    const { scene } = useColorThemeDefinition();
    const shown = scene === 'snowy-roofline';
    // The window's lights-on token lives outside React; a theme without the
    // roofline re-arms it for the next time one is switched on.
    React.useEffect(() => {
        if (!shown) {
            armLightsOn();
        }
    }, [shown]);
    if (!shown) {
        return null;
    }
    // Keyed so a new placement starts a fresh scene with the current look.
    return <RooflineCanvases key={placement} placement={placement} />;
}

function RooflineCanvases({ placement }: { placement: RooflinePlacement }) {
    const snow = useRooflineSnow();
    const dark = useResolvedThemeOptional() === 'dark';
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const flurriesRef = React.useRef<HTMLCanvasElement | null>(null);
    const bulbsRef = React.useRef<HTMLCanvasElement | null>(null);
    const snowRef = React.useRef<HTMLCanvasElement | null>(null);
    const rooflineRef = React.useRef<Roofline | null>(null);

    // Runs the canvases against the browser's frame clock, sizes, and focus.
    React.useEffect(() => {
        const root = rootRef.current;
        const flurries = flurriesRef.current;
        const bulbs = bulbsRef.current;
        const snowLayer = snowRef.current;
        if (!(root && flurries && bulbs && snowLayer)) {
            return;
        }
        const roofline = startRoofline({ bulbs, flurries, root, snow: snowLayer }, placement);
        rooflineRef.current = roofline;
        return () => {
            roofline.stop();
            rooflineRef.current = null;
        };
    }, [placement]);

    // Declared after the start effect, so on mount it hands the first look to
    // the running scene before its first frame.
    React.useEffect(() => {
        rooflineRef.current?.update({ dark, snow });
    }, [dark, snow]);

    return (
        <div
            aria-hidden="true"
            className={`theme-roofline theme-roofline--${placement}`}
            ref={rootRef}
        >
            <canvas className="theme-roofline__flurries" ref={flurriesRef} />
            <canvas className="theme-roofline__bulbs" ref={bulbsRef} />
            <canvas className="theme-roofline__snow" ref={snowRef} />
        </div>
    );
}
