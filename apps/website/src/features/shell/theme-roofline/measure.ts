import { type BulbSlot, bulbSlots, type Span } from './geometry.ts';

/**
 * Where the roofline hangs: across the desktop window band, or along the top
 * of the web sidebar (which has no band) behind its titlebar strip.
 */
export type RooflinePlacement = 'band' | 'sidebar';

interface Fit {
    /** The sibling whose controls no bulb may hang behind. */
    controls: string;
    /** The sibling whose end gets a holly sprig of its own, if any. */
    lead: string | null;
    /** Where the bulb grid starts: past the lead (the snow still runs over it), or at the edge. */
    start: 'lead-end' | 'edge';
}

const fits: Record<RooflinePlacement, Fit> = {
    // The sidebar lead keeps the snow but no bulbs: a couple of bulbs squeezed
    // between the traffic lights and Back and Forward read as stragglers. From
    // the lead's end on, bulbs leave room for every tab and the New tab
    // button, so the snow drapes over the tabs with nothing peeking out
    // half-hidden behind them.
    band: {
        controls: ':scope > .workspace-titlebar',
        lead: ':scope > .shell-window-band__lead',
        start: 'lead-end',
    },
    // The Haus mark and the Settings gear lead and end the web strip; bulbs
    // hang only in the run between them.
    sidebar: {
        controls: ':scope > .app-shell-titlebar-strip',
        lead: null,
        start: 'edge',
    },
};

/** What chrome a bulb must not hang behind: tabs and anything clickable. */
const controlSelector = '.workspace-tab, a[href], button, [role="button"], [role="tab"]';

export interface RooflineLayout {
    bulbs: readonly BulbSlot[];
    height: number;
    /** The lead's end, for its holly sprig; `null` where the placement has no lead. */
    leadEnd: number | null;
    width: number;
}

export const emptyLayout: RooflineLayout = { bulbs: [], height: 0, leadEnd: null, width: 0 };

/** The elements whose size or contents move the bulbs, to observe alongside the roofline. */
export function rooflineNeighbors(root: HTMLElement, placement: RooflinePlacement): HTMLElement[] {
    const fit = fits[placement];
    const parent = root.parentElement;
    const found = [fit.controls, fit.lead].map((selector) =>
        selector ? parent?.querySelector<HTMLElement>(selector) : null
    );
    return [...new Set(found.filter((element) => element instanceof HTMLElement))];
}

/**
 * Reads the roofline's box and the chrome around it: the bulb grid starts at
 * the placement's start (past the band's lead) and skips every tab and
 * control box in the placement's controls sibling.
 */
export function measureRoofline(root: HTMLElement, placement: RooflinePlacement): RooflineLayout {
    const fit = fits[placement];
    const box = root.getBoundingClientRect();
    const parent = root.parentElement;
    const skip: Span[] = [];
    const lead = fit.lead ? parent?.querySelector(fit.lead) : null;
    const leadEnd = lead ? lead.getBoundingClientRect().right - box.left : null;
    const start = fit.start === 'lead-end' && leadEnd !== null ? Math.max(leadEnd, 0) : 0;
    if (start > 0) {
        skip.push({ end: start, start: 0 });
    }
    const controls = parent?.querySelector(fit.controls);
    for (const control of controls?.querySelectorAll(controlSelector) ?? []) {
        const rect = control.getBoundingClientRect();
        if (rect.width > 0) {
            skip.push({ end: rect.right - box.left, start: rect.left - box.left });
        }
    }
    return {
        bulbs: bulbSlots({ skip, start, width: box.width }),
        height: box.height,
        leadEnd,
        width: box.width,
    };
}
