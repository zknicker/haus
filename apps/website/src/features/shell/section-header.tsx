import type { ReactNode } from 'react';

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
 * A chat's web band row: its identity (`leading`), a meta cluster, then
 * trailing actions. Carries no band chrome — render it inside the shell band
 * via PageTopbar. Every other surface's band is a `PageBand`; a chat is the
 * one surface whose band names a conversation rather than a place, and on
 * desktop it has no band at all (its tab names it).
 */
export function SectionHeader({
    children,
    leading,
    meta,
}: {
    children?: ReactNode;
    leading?: ReactNode;
    meta?: ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-1 items-center gap-3">
            {leading}
            {meta}
            {children ? (
                <div className="ms-auto flex min-w-0 items-center gap-2">{children}</div>
            ) : null}
        </div>
    );
}
