/** Shared footprint for pending and durable transcript turns. */
export const transcriptTurnGeometry = {
    avatar: 'mt-1',
    body: 'gap-0',
    header: 'flex min-w-0 max-w-full items-baseline gap-2 text-muted text-xs',
    name: 'shrink-0 truncate font-semibold text-sm leading-tight',
    // Keep the bleed width on the same theme-scaled unit as its two margins.
    // A fixed rem width overflows compact panes; omitting it clips the right wash.
    row: '-mx-5 relative w-[calc(100%+var(--spacing)*10)] px-5 py-2',
} as const;
