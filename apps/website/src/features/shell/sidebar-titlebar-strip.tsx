import type * as React from 'react';
import { Link } from 'react-router-dom';
import { HausGhost } from '../../components/haus-ghost.tsx';
import { useOptionalCurrentAgentActivity } from '../../hooks/agents/use-current-agent-activity.tsx';
import { inboxRoute } from '../servers/server-routes.ts';
import { resolveAgentActivityGhostTempo } from './agent-activity-ghost-tempo.ts';

/**
 * The strip every surface reserves above the sidebar's navigation, and what
 * rides in it: Settings at the trailing end always, and on the web the Haus
 * mark at the leading one.
 *
 * One component rather than two floating boxes, because the two ends only read
 * as one line if they share it. The strip is the line — `shell.css` gives it
 * the traffic lights' own vertical axis and the navigation's leading edge — so
 * whatever sits in it lands on one midline by construction instead of by two
 * absolute offsets kept equal by hand.
 *
 * `leadsWithMark` is the platform fork, and the whole of it. The macOS desktop
 * already has something leading this line: the traffic lights, which the strip
 * exists to clear. Putting the mark after them read as a second row of chrome,
 * so there the mark stays where it has always been — on the Inbox row — and the
 * strip carries the gear alone. The web has nothing up there, so the mark takes
 * the corner a wordmark would.
 *
 * On the web the mark is also the way home: a plain link to the Inbox, the way
 * a wordmark in a product's corner is. It navigates and does nothing else —
 * no hover treatment, nothing that reads as a button — and being a real link
 * it earns a real tab stop, which `:focus-visible` paints. The ghost itself
 * stays `aria-hidden`; the link carries the name, and that name is "Haus",
 * the product mark and the breadcrumb's own leading crumb. Naming it for its
 * destination instead put two tab stops called "Inbox", 40px apart, pointing
 * at the same page.
 *
 * The mark always wears the app-icon mesh, and its drift speed is the Server's
 * live-work tell — a slow shimmer while the Server is quiet, noticeably quicker
 * while any Agent works.
 */
export function SidebarTitlebarStrip({
    leadsWithMark,
    settingsAction,
    slug,
}: {
    leadsWithMark: boolean;
    settingsAction?: React.ReactNode;
    slug: string;
}) {
    const tempo = resolveAgentActivityGhostTempo(useOptionalCurrentAgentActivity());

    return (
        <div className="app-shell-titlebar-strip">
            {leadsWithMark ? (
                <Link
                    aria-label="Haus"
                    className="app-shell-titlebar-mark inline-flex rounded-md"
                    to={inboxRoute(slug)}
                >
                    {/* 22, the same box the mark takes on the Inbox row's icon
                        column on the macOS desktop, so the ghost is one size
                        everywhere it appears. 24 was tried to match the band
                        rule's identity-mark box beside the 18px gear glyph;
                        Zach read it as bigger, not heavier, and the one-size
                        rule matters more than the weight. */}
                    <HausGhost
                        animated
                        aria-hidden="true"
                        fill="iridescent"
                        size={22}
                        tempo={tempo}
                    />
                </Link>
            ) : null}
            {settingsAction}
        </div>
    );
}
