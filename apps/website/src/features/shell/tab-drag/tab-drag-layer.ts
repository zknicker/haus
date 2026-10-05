import { tabElement } from './tab-band-dom.ts';
import { isSettling } from './use-row-flip.ts';

/** Marks a real tab whose look the layer draws; the theme hides it (`default-theme.css`). */
const mirroredAttribute = 'data-drag-mirrored';
/** The tab states its look depends on, copied onto the copy every frame. */
const mirroredStates = ['data-active', 'data-selected', 'data-dragging'] as const;

interface Mirror {
    copy: HTMLElement;
    /** The pointer drags this tab now. */
    held: boolean;
    source: HTMLElement;
}

/**
 * Draws dragged tabs on the band's drag layer, above both rows and unclipped
 * by either. A row clips its tabs, and a crowded row scrolls them
 * (`tab-reveal.ts`); letting a dragged tab escape its row would cost the row
 * that scroll. So the real tab keeps its slot, its pointer offset and its
 * slides (`use-row-flip.ts`) but paints nothing, and an inert, hidden copy is
 * placed over its box on every paint and every animation frame, until the
 * tab has stopped dragging and settled into its slot.
 */
export function createTabDragLayer(deps: {
    band: () => HTMLElement | null;
    layer: () => HTMLElement | null;
}) {
    const mirrors = new Map<string, Mirror>();
    let frame = 0;

    const sync = () => {
        const band = deps.band();
        const layer = deps.layer();
        for (const [tabId, mirror] of mirrors) {
            const source = band ? tabElement(band, tabId) : null;
            const drawn =
                source && (mirror.held || source.dataset.dragging === 'true' || isSettling(source));
            if (!(layer && drawn)) {
                release(tabId, mirror);
                continue;
            }
            place(layer, mirror, source);
        }
        if (mirrors.size > 0 && frame === 0) {
            frame = requestAnimationFrame(() => {
                frame = 0;
                sync();
            });
        }
    };

    const release = (tabId: string, mirror: Mirror) => {
        mirror.copy.remove();
        mirror.source.removeAttribute(mirroredAttribute);
        mirrors.delete(tabId);
    };

    return {
        /**
         * Draws the dragged tabs `offset` px from their slots (the real tabs
         * carry the offset, so rows measure and slide them where they are drawn)
         * and returns the width last drawn, or null when no tab is drawn here.
         */
        draw(tabIds: readonly string[], offset: number): number | null {
            const band = deps.band();
            let width: number | null = null;
            for (const mirror of mirrors.values()) {
                mirror.held = false;
            }
            for (const tabId of tabIds) {
                const source = band ? tabElement(band, tabId) : null;
                if (!source) {
                    continue;
                }
                source.style.transform = `translateX(${offset}px)`;
                width = source.offsetWidth;
                const mirror = mirrors.get(tabId);
                if (mirror) {
                    mirror.held = true;
                } else {
                    mirrors.set(tabId, { copy: copyOf(source), held: true, source });
                }
            }
            sync();
            return width;
        },
        /** The pointer let go: each copy stays until its tab has settled into its slot. */
        letGo() {
            for (const mirror of mirrors.values()) {
                mirror.held = false;
            }
            sync();
        },
    };
}

/** Puts the copy over the real tab's painted box, offset, slide and all. */
function place(layer: HTMLElement, mirror: Mirror, source: HTMLElement) {
    if (mirror.source !== source) {
        // The tab remounted in the row it entered.
        mirror.source.removeAttribute(mirroredAttribute);
        mirror.copy.remove();
        mirror.copy = copyOf(source);
        mirror.source = source;
    }
    const { copy } = mirror;
    if (!copy.isConnected) {
        layer.append(copy);
    }
    source.setAttribute(mirroredAttribute, '');
    for (const name of mirroredStates) {
        const value = source.getAttribute(name);
        if (value === null) {
            copy.removeAttribute(name);
        } else {
            copy.setAttribute(name, value);
        }
    }
    const box = source.getBoundingClientRect();
    const origin = layer.getBoundingClientRect();
    copy.style.width = `${box.width}px`;
    copy.style.height = `${box.height}px`;
    copy.style.minWidth = '0';
    copy.style.translate = 'none';
    copy.style.transform = `translate(${box.left - origin.left}px, ${box.top - origin.top}px)`;
}

/** A look-only copy of a tab: no id, no tab identity, out of focus order and the accessibility tree. */
function copyOf(source: HTMLElement): HTMLElement {
    const copy = source.cloneNode(true) as HTMLElement;
    for (const element of [copy, ...copy.querySelectorAll('[id]')]) {
        element.removeAttribute('id');
    }
    copy.removeAttribute('data-tab-id');
    copy.removeAttribute(mirroredAttribute);
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    return copy;
}
