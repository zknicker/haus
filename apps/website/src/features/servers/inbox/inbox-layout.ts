/**
 * The Inbox's one arrangement: a single reading column that scrolls as one
 * page, the way every routed page does, with the week's Agent activity as a
 * strip beside the greeting rather than a rail beside the feed.
 *
 * The page runs up under its band (`PageBand overlay`): the frame starts at
 * the shell's top edge, behind the band, so scrolled content is cut off there
 * and not at the band's bottom. The column's top inset therefore adds the
 * band's height, and the frame carries the transcript's own top edge band
 * (`.transcript-edge-blur`), which dissolves content as it slides under the
 * trail so the trail stays legible over it.
 */
export const inboxLayout = {
    /** The pane's body, behind the band. It never scrolls. */
    frame: 'relative flex min-h-0 flex-1 flex-col',
    /** The page's one scroller. */
    scroller: 'min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]',
    /** The page column, starting clear of the band it runs under. */
    column: 'pt-[calc(var(--app-shell-band-height)+var(--spacing)*8)]',
    /** The greeting and the Agent strip on one line; a narrow pane drops the strip under it. */
    head: 'flex flex-wrap items-end justify-between gap-x-6 gap-y-4',
} as const;
