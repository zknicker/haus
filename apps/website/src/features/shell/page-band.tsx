import type { ReactNode } from 'react';
import { BandBreadcrumbs } from './band-breadcrumbs.tsx';
import type { BandCrumb } from './band-trail.ts';
import { PageTopbar } from './shell-topbar.tsx';

/**
 * The one header band every content surface renders (Inbox, Search, Tasks,
 * Files, Activity, Settings, Agent pages): where you are, then the page's own
 * controls at the far end. Back and Forward are the shell's, not the page's —
 * they lead the band on the web (`ShellTopbar`) and sit in the window's title
 * bar on desktop — so a band only ever says where you are and what you can do here.
 *
 * Compose the slots directly:
 *
 * ```tsx
 * <PageBand>
 *     <PageBand.Trail crumbs={[filesCrumb, folderCrumb]} current={{ label: 'scripts' }} />
 *     <PageBand.Controls>…</PageBand.Controls>
 * </PageBand>
 * ```
 *
 * Chats are the one exception: a conversation runs full height under its tab
 * on desktop, and on the web its band carries the chat's identity instead.
 * The row is the `band` container controls may size themselves against.
 *
 * `overlay` lets the page run up under the band instead of starting below it:
 * the band paints over the page, whose scrollers then reach the shell's top
 * edge rather than being cut off at the band's bottom (`shell.css`). A page
 * that asks for it owns the rest: it insets its content by the band's height,
 * and fades what scrolls under the band so the trail stays legible (the
 * Inbox, `inbox-layout.ts`).
 */
export function PageBand({
    children,
    overlay = false,
}: {
    children: ReactNode;
    overlay?: boolean;
}) {
    return (
        <PageTopbar>
            {/* With a centered slot the row becomes three columns, equal flexible
                sides anchoring the center to the band's true middle. */}
            <div
                className="@container/band flex min-w-0 flex-1 items-center gap-3 [&:has(>[data-band-center])]:grid [&:has(>[data-band-center])]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
                data-band-overlay={overlay ? '' : undefined}
            >
                {children}
            </div>
        </PageTopbar>
    );
}

/** The band's trail: Haus › section › … › current page. */
function PageBandTrail({
    children,
    crumbs = [],
    current,
}: {
    children?: ReactNode;
    /** The section first, then each step before the current page; empty when the page is the section. */
    crumbs?: readonly BandCrumb[];
    current?: BandCrumb | string;
}) {
    return (
        <BandBreadcrumbs
            crumbs={crumbs}
            current={typeof current === 'string' ? { label: current } : current}
        >
            {children}
        </BandBreadcrumbs>
    );
}

/** A control centered on the band's true middle (Search's field), whatever the trail's width. */
function PageBandCenter({ children }: { children: ReactNode }) {
    return (
        <div className="flex w-96 min-w-0 justify-center" data-band-center="">
            {children}
        </div>
    );
}

/** The page's controls, at the band's far end. */
function PageBandControls({ children }: { children: ReactNode }) {
    return <div className="ms-auto flex min-w-0 shrink-0 items-center gap-2">{children}</div>;
}

PageBand.Trail = PageBandTrail;
PageBand.Center = PageBandCenter;
PageBand.Controls = PageBandControls;
