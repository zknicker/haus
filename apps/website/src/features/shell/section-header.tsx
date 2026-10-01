import type { ReactNode } from 'react';
import { useWorkspaceBandTabLabel } from './workspace-band-tab-label.ts';

/**
 * The band height every top-of-column zone shares: the shell topbar, local
 * SectionBars, the macOS titlebar strip, and the box the sidebar's lead
 * navigation row is offset onto — half a band, which is how that row's midline
 * meets the shell topbar's across the divider. The value itself lives in
 * shell.css as --app-shell-band-height, because the native window's traffic lights must be
 * centered on the same number from outside the renderer.
 */
export const bandHeightClassName = 'app-shell-band h-[var(--app-shell-band-height)]';

/**
 * Intrinsic size for icon glyphs, in px.
 *
 * Inside a HeroUI Button this is only the SVG's intrinsic size — `.button--sm
 * svg` sets `width` from `--spacing`, and a CSS rule beats an SVG presentation
 * attribute, so the number here never reached the screen. Band chrome is sized
 * by `.app-shell-band` in `shell.css` instead, against the 24px identity marks
 * it sits beside; this stays as the honest intrinsic value.
 */
export const shellBandIconSize = 24;

/**
 * Intrinsic size for icon-only actions inside the sidebar's navigation column
 * — a different rank from the band above, sitting beside 16px menu icons
 * rather than 24px identity marks. Same caveat as above inside a Button.
 */
export const sidebarActionIconSize = 20;

/**
 * The one topbar band chrome: fixed height, gutter, and no rule beneath it.
 * The shell renders exactly one of these above the routed content
 * (ShellTopbar); embedded surfaces that need a local band (a panel, a tab
 * body) may render their own. The px-3 gutter matches the sidebar's stock
 * content gutter, so band content on both sides of the divider shares one
 * inset; routed content below keeps its own deeper reading gutter.
 *
 * The band draws no bottom hairline. It sits on the same surface as the
 * content under it, so the rule was separating a plane from itself — the
 * sidebar's tint and the divider beside it already say where chrome ends.
 * What remains is a title floating over one continuous page, which is the
 * whole reason the seam reads as absent rather than missing.
 */
export function SectionBar({ children }: { children?: ReactNode }) {
    return (
        <header className={`flex ${bandHeightClassName} shrink-0 items-center px-3`}>
            {children}
        </header>
    );
}

/**
 * Topbar content row: optional leading icon, title, meta cluster, muted
 * description, optional centered slot, trailing actions. Carries no band
 * chrome — render it inside the shell band via PageTopbar, or inside a
 * local SectionBar. Title is for content identity (a chat's name); section
 * pages omit it — the rail and the window title already say where you are.
 *
 * Beside the desktop primary workspace tab, the tab is the page's identity:
 * its mark replaces `leading`, and a title repeating its label is dropped, so
 * only content the tab does not carry (a more specific title, actions) shows.
 */
export function SectionHeader({
    center,
    children,
    description,
    leading: pageLeading,
    meta,
    title: pageTitle,
}: {
    center?: ReactNode;
    children?: ReactNode;
    description?: ReactNode;
    leading?: ReactNode;
    meta?: ReactNode;
    title?: ReactNode;
}) {
    const tabLabel = useWorkspaceBandTabLabel();
    const leading = tabLabel === null ? pageLeading : null;
    const title = tabLabel !== null && pageTitle === tabLabel ? null : pageTitle;
    if (!(leading || title || meta || description || center || children)) {
        return null;
    }
    if (center) {
        // Equal flexible side columns anchor the center slot to the band's
        // true middle, so it does not drift with the title's width.
        return (
            <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    {leading}
                    {title ? (
                        <h1 className="min-w-0 shrink truncate font-semibold text-sm">{title}</h1>
                    ) : null}
                    {meta}
                    {description ? (
                        <p className="truncate text-muted text-xs">{description}</p>
                    ) : null}
                </div>
                <div className="flex min-w-0 items-center justify-center">{center}</div>
                <div className="flex min-w-0 items-center justify-end gap-2">{children}</div>
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-1 items-center gap-3">
            {leading}
            {title ? (
                <h1 className="min-w-0 shrink truncate font-semibold text-sm">{title}</h1>
            ) : null}
            {meta}
            {description ? <p className="truncate text-muted text-xs">{description}</p> : null}
            {children ? (
                <div className="ms-auto flex min-w-0 items-center gap-2">{children}</div>
            ) : null}
        </div>
    );
}
