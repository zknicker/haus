import { getTranscriptItemKey } from './chat-transcript-item-utils.ts';
import {
    getEstimatedTranscriptRowSize,
    type TranscriptRenderRow,
} from './chat-transcript-row-model.ts';

/** Where a transcript first opens: its end, or a row it remembers. */
export type TranscriptWindowAnchor = { kind: 'end' } | { kind: 'row'; rowId: string };

/**
 * Which transcript rows have rendered their content. Every row keeps its
 * scroller item in the DOM, so order, prepend detection, and native scroll
 * anchoring behave as before; a row outside the window is an empty item at
 * its estimated height. Rows join the window and never leave it: the first
 * render takes only the rows that fill the opening viewport, and the rest
 * render as they near the viewport (`observe`), as new rows arrive next to
 * rendered ones, or when a jump needs them (`renderAroundMessage`). A chat
 * switch therefore costs the rows on screen, not the transcript's length.
 */
export interface TranscriptRenderWindow {
    /** Takes a new row list: opens the window on first use, then admits new rows next to rendered ones. */
    admit(
        rows: readonly TranscriptRenderRow[],
        anchor: TranscriptWindowAnchor,
        budget: number
    ): void;
    /** Resumes watching the placeholders `disconnect` paused. */
    connect(): void;
    /** Stops watching placeholders, keeping them for `connect`. */
    disconnect(): void;
    isRendered(row: TranscriptRenderRow): boolean;
    /** Watches a placeholder row, rendering it once it comes within a viewport of the visible range. */
    observe(element: HTMLElement, row: TranscriptRenderRow): void;
    /** Renders the rows around a message; true when that rendered something new. */
    renderAroundMessage(
        rows: readonly TranscriptRenderRow[],
        messageId: string,
        budget: number
    ): boolean;
    subscribe(listener: () => void): () => void;
    unobserve(element: HTMLElement): void;
}

/** Overscan past each edge of the viewport, as a fraction of its height. */
const overscanMargin = '100% 0px 100% 0px';
const viewportSelector = '[data-slot="message-scroller-viewport"]';

export function createTranscriptRenderWindow(): TranscriptRenderWindow {
    // Without IntersectionObserver nothing would ever render on approach.
    const renderAll = typeof IntersectionObserver === 'undefined';
    const renderedKeys = new Set<string>();
    const listeners = new Set<() => void>();
    const observed = new Map<Element, TranscriptRenderRow>();
    let knownRowIds: ReadonlySet<string> | null = null;
    let lastRows: readonly TranscriptRenderRow[] | null = null;
    let observer: IntersectionObserver | null = null;
    let root: HTMLElement | null = null;
    const startObserving = () => {
        observer = new IntersectionObserver(onIntersect, { root, rootMargin: overscanMargin });
        for (const element of observed.keys()) {
            observer.observe(element);
        }
    };

    const isRendered = (row: TranscriptRenderRow) =>
        renderAll || row.kind !== 'entry' || getRowKeys(row).some((key) => renderedKeys.has(key));
    const add = (row: TranscriptRenderRow) => {
        let added = false;
        for (const key of getRowKeys(row)) {
            if (!renderedKeys.has(key)) {
                renderedKeys.add(key);
                added = true;
            }
        }
        return added;
    };
    const render = (rows: Iterable<TranscriptRenderRow>) => {
        let added = false;
        for (const row of rows) {
            added = add(row) || added;
        }
        if (added) {
            for (const listener of listeners) {
                listener();
            }
        }
        return added;
    };
    const onIntersect = (entries: IntersectionObserverEntry[]) => {
        const near: TranscriptRenderRow[] = [];
        for (const entry of entries) {
            const row = observed.get(entry.target);
            if (row && entry.isIntersecting) {
                near.push(row);
                observed.delete(entry.target);
                observer?.unobserve(entry.target);
            }
        }
        render(near);
    };

    return {
        admit(rows, anchor, budget) {
            if (renderAll || rows === lastRows) {
                return;
            }
            lastRows = rows;
            if (knownRowIds === null) {
                if (rows.length === 0) {
                    return;
                }
                const index =
                    anchor.kind === 'row' ? rows.findIndex((r) => r.id === anchor.rowId) : -1;
                const [start, end] =
                    index >= 0
                        ? pickRowRange(rows, index, budget, budget)
                        : pickRowRange(rows, rows.length - 1, budget * 1.5, 0);
                rows.slice(start, end + 1).forEach(add);
            } else {
                admitNewRows(rows, knownRowIds, isRendered, add, budget);
            }
            // Silent: a row admitted here is new to this render and reads the
            // window when it mounts; notifying would update other rows mid-render.
            knownRowIds = new Set(rows.map((row) => row.id));
        },
        connect() {
            if (!observer && root && observed.size > 0) {
                startObserving();
            }
        },
        disconnect() {
            observer?.disconnect();
            observer = null;
        },
        isRendered,
        observe(element, row) {
            if (isRendered(row)) {
                return;
            }
            root ??= element.closest<HTMLElement>(viewportSelector);
            if (!root) {
                return;
            }
            observed.set(element, row);
            if (observer) {
                observer.observe(element);
            } else {
                startObserving();
            }
        },
        renderAroundMessage(rows, messageId, budget) {
            const index = rows.findIndex((row) => rowContainsMessage(row, messageId));
            if (index < 0) {
                return false;
            }
            const [start, end] = pickRowRange(rows, index, budget, budget);
            return render(rows.slice(start, end + 1));
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        unobserve(element) {
            if (observed.delete(element)) {
                observer?.unobserve(element);
            }
        },
    };
}

/**
 * The inclusive index range around `index` whose estimated heights cover
 * `above` pixels before it and `below` pixels from its top down.
 */
export function pickRowRange(
    rows: readonly TranscriptRenderRow[],
    index: number,
    above: number,
    below: number
): [number, number] {
    let end = index;
    let belowHeight = getEstimatedTranscriptRowSize(rows[index]);
    while (end + 1 < rows.length && belowHeight < below) {
        end += 1;
        belowHeight += getEstimatedTranscriptRowSize(rows[end]);
    }
    let start = index;
    let aboveHeight = 0;
    while (start > 0 && aboveHeight < above) {
        start -= 1;
        aboveHeight += getEstimatedTranscriptRowSize(rows[start]);
    }
    return [start, end];
}

export function rowContainsMessage(row: TranscriptRenderRow, messageId: string) {
    return (
        row.kind === 'entry' &&
        getEntryItems(row).some(
            (item) =>
                item.kind === 'row' &&
                item.row.kind === 'message' &&
                item.row.message.id === messageId
        )
    );
}

/**
 * A new entry renders at once when the entry before it has: messages arriving
 * at a rendered end, or between rendered rows. New entries that land just
 * above a rendered one (an older page reaching the top the reader is at)
 * render their last `budget` pixels at once, so the scroller's prepend restore
 * measures real heights: rows that rendered a frame later would shift the
 * reader's row by their estimate error, which native scroll anchoring does not
 * correct right after that programmatic restore. Older rows wait for the
 * viewport like any other placeholder.
 */
function admitNewRows(
    rows: readonly TranscriptRenderRow[],
    knownRowIds: ReadonlySet<string>,
    isRendered: (row: TranscriptRenderRow) => boolean,
    add: (row: TranscriptRenderRow) => boolean,
    budget: number
) {
    let previousRendered = false;
    let waiting: TranscriptRenderRow[] = [];
    for (const row of rows) {
        if (row.kind !== 'entry') {
            waiting.push(row);
            continue;
        }
        if (!(knownRowIds.has(row.id) || isRendered(row))) {
            if (previousRendered) {
                add(row);
            } else {
                waiting.push(row);
            }
            continue;
        }
        previousRendered = isRendered(row);
        if (previousRendered) {
            renderTail(waiting, budget, add);
        }
        waiting = [];
    }
}

function renderTail(
    rows: readonly TranscriptRenderRow[],
    budget: number,
    add: (row: TranscriptRenderRow) => boolean
) {
    let height = 0;
    for (let index = rows.length - 1; index >= 0 && height < budget; index -= 1) {
        const row = rows[index] as TranscriptRenderRow;
        add(row);
        height += getEstimatedTranscriptRowSize(row);
    }
}

const rowKeysCache = new WeakMap<TranscriptRenderRow, readonly string[]>();

/**
 * A row's identity for the window: its id and its items' keys. An entry's id
 * can change when an older page joins its turn; it stays rendered because it
 * still holds a rendered item.
 */
function getRowKeys(row: TranscriptRenderRow): readonly string[] {
    const cached = rowKeysCache.get(row);
    if (cached) {
        return cached;
    }
    const keys = [row.id, ...getEntryItems(row).map(getTranscriptItemKey)];
    rowKeysCache.set(row, keys);
    return keys;
}

function getEntryItems(row: TranscriptRenderRow) {
    if (row.kind !== 'entry') {
        return [];
    }
    return row.entry.kind === 'turn' ? row.entry.items : [row.entry.item];
}
