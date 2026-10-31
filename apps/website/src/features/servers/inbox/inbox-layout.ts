/**
 * The Inbox's two arrangements, as one tree that a container query reshapes.
 *
 * The page's frame is the `@container/inbox`, so the switch follows the pane
 * the Inbox sits in, never the window: a split view narrows the pane on a wide
 * window, and the Inbox has to fold with it. A container query styles only the
 * container's descendants, so the frame itself never scrolls; the elements
 * under it decide who does.
 *
 * - **Narrow**: one column — greeting, notices, the strip, Unread — and one
 *   scroller for the whole page, as every routed page has.
 * - **Wide** (the pane at 60rem and up): the feed in a flexible column and the
 *   rail — the Agents meter over Happening now — in a fixed 19rem column beside
 *   it, each scrolling on its own under the still band. The page scroller
 *   stops scrolling and only holds the column at the pane's height, and the
 *   column hands its top and bottom insets to the two scrollers, so content
 *   starts clear of the band and the last card clears the bottom edge. Neither
 *   column draws a scrollbar: two bars running down the middle of the page
 *   read as clutter, and both columns still scroll by wheel and trackpad.
 *
 * The page runs up under its band (`PageBand overlay`): the frame starts at the
 * shell's top edge, behind the band, so scrolled content is cut off there and
 * not at the band's bottom. Every top inset therefore adds the band's height,
 * which keeps the greeting and the rail's first label where they were. Over
 * both columns, the frame carries the transcript's own top edge band
 * (`.transcript-edge-blur`), which dissolves content as it slides under the
 * trail so the trail stays legible over it.
 *
 * Both arrangements are one tree, in reading order: greeting, then the data
 * owner's strip and rail, then Unread, all inside the feed. When wide, the rail
 * leaves the feed by position: it is placed against the `body` box, which
 * sits outside the feed scroller, and an element whose containing block lies
 * outside a scroller neither scrolls with it nor is clipped by it. That keeps
 * the owner rendering strip and rail side by side, so each read runs once
 * however the pane is shaped, and the Unread heading never remounts.
 *
 * Tailwind reads class names out of source text, so every variant here is
 * spelled whole; change the threshold everywhere together, and the rail's
 * width together with the feed's end margin (the rail plus a `gap-x-10` step).
 *
 * A scroller clips everything outside its box, cards' outer ring included, so
 * each wide column pads one step inside its edges and gives that step back to
 * the layout: the feed by a negative start margin and one step less end
 * margin, the rail by a box one step wider on each side, pulled one step past
 * the end. Content keeps its place and the rings keep their edges.
 */
export const inboxLayout = {
    /** The container the query measures: the pane's body, behind the band. It never scrolls. */
    frame: '@container/inbox relative flex min-h-0 flex-1 flex-col',
    /** Narrow, the page's one scroller; wide, a still box that holds the column at pane height. */
    scroller:
        'min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] @min-[60rem]/inbox:flex @min-[60rem]/inbox:flex-col @min-[60rem]/inbox:overflow-hidden @min-[60rem]/inbox:[scrollbar-gutter:auto]',
    /** The page column, which wide gives its full height and hands its insets to the scrollers. */
    column: 'pt-[calc(var(--app-shell-band-height)+var(--spacing)*8)] @min-[60rem]/inbox:min-h-0 @min-[60rem]/inbox:flex-1 @min-[60rem]/inbox:pt-0 @min-[60rem]/inbox:pb-0',
    /** The column's content box: what the wide rail is placed against. */
    body: 'relative min-w-0 @min-[60rem]/inbox:flex @min-[60rem]/inbox:min-h-0 @min-[60rem]/inbox:flex-1 @min-[60rem]/inbox:flex-col',
    /** The feed: the page's flow when narrow; its own scroller beside the rail when wide. */
    feed: 'flex min-w-0 flex-col gap-8 @min-[60rem]/inbox:-ms-1 @min-[60rem]/inbox:me-[calc(19rem+var(--spacing)*9)] @min-[60rem]/inbox:px-1 @min-[60rem]/inbox:min-h-0 @min-[60rem]/inbox:flex-1 @min-[60rem]/inbox:overflow-y-auto @min-[60rem]/inbox:pt-[calc(var(--app-shell-band-height)+var(--spacing)*8)] @min-[60rem]/inbox:pb-16 @min-[60rem]/inbox:[scrollbar-width:none]',
    /** The rail: absent when narrow; its own scroller at the body's end edge when wide. */
    rail: 'hidden min-w-0 flex-col gap-8 @min-[60rem]/inbox:absolute @min-[60rem]/inbox:inset-y-0 @min-[60rem]/inbox:-end-1 @min-[60rem]/inbox:flex @min-[60rem]/inbox:w-[calc(19rem+var(--spacing)*2)] @min-[60rem]/inbox:px-1 @min-[60rem]/inbox:overflow-y-auto @min-[60rem]/inbox:overscroll-contain @min-[60rem]/inbox:pt-[calc(var(--app-shell-band-height)+var(--spacing)*8)] @min-[60rem]/inbox:pb-16 @min-[60rem]/inbox:[scrollbar-width:none]',
    /** The strip: present when narrow, gone when the rail can carry the same facts. */
    strip: 'min-w-0 @min-[60rem]/inbox:hidden',
} as const;
