import { Button, ScrollShadow } from '@heroui/react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import * as React from 'react';
import { getChannelColorStyle } from '../../components/chats/channel-color-options.ts';
import {
    type ChannelIconCatalog,
    type ChannelIconEntry,
    filterChannelIcons,
    useChannelIconCatalog,
} from '../../components/chats/channel-icon-catalog.ts';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import {
    buildChannelIconRows,
    type ChannelIconRow,
    channelIconRowIndex,
} from './channel-icon-grid-rows.ts';

// The popover keeps the grid short enough to sit under a form field; the
// Icon & color dialog gives the catalog more room. Column count is tuned per
// container width so the buttons pack densely (an emoji-picker feel) rather
// than leaving voids between cells.
const channelIconGridVariants = {
    compact: { columns: 8, columnsClassName: 'grid-cols-8', heightClassName: 'h-72' },
    tall: { columns: 9, columnsClassName: 'grid-cols-9', heightClassName: 'h-80' },
} as const;

export type ChannelIconGridSize = keyof typeof channelIconGridVariants;

type ChannelIconGridVariant = (typeof channelIconGridVariants)[ChannelIconGridSize];

// Only the first frame uses these; `measureElement` replaces them with the real
// heights as rows mount.
const estimatedRowHeights = { header: 28, icons: 36 } as const;
const overscanRows = 4;

/** The catalog grid: grouped while browsing, flat while searching. */
export function ChannelIconGrid({
    color,
    onSelect,
    query,
    selectedIcon,
    size = 'compact',
}: {
    color: string | null;
    onSelect: (icon: string) => void;
    query: string;
    selectedIcon: string | null;
    size?: ChannelIconGridSize;
}) {
    const catalog = useChannelIconCatalog();
    const variant = channelIconGridVariants[size];

    // The catalog is one chunk away, so the grid holds its height and stays
    // blank rather than flashing a placeholder at it. Gating here rather than
    // inside the grid keeps the virtualizer's scroll element present from its
    // own first render.
    if (!catalog) {
        return <div className={cn(variant.heightClassName, 'mt-3 min-h-0')} />;
    }

    return (
        <ChannelIconCatalogGrid
            catalog={catalog}
            color={color}
            onSelect={onSelect}
            query={query}
            selectedIcon={selectedIcon}
            variant={variant}
        />
    );
}

function ChannelIconCatalogGrid({
    catalog,
    color,
    onSelect,
    query,
    selectedIcon,
    variant,
}: {
    catalog: ChannelIconCatalog;
    color: string | null;
    onSelect: (icon: string) => void;
    query: string;
    selectedIcon: string | null;
    variant: ChannelIconGridVariant;
}) {
    const scrollerRef = React.useRef<HTMLDivElement | null>(null);
    const trimmedQuery = query.trim();
    const rows = React.useMemo(
        () =>
            buildChannelIconRows({
                columns: variant.columns,
                entries: filterChannelIcons(catalog.entries, trimmedQuery),
                groups: catalog.groups,
                isGrouped: trimmedQuery.length === 0,
            }),
        [catalog, trimmedQuery, variant.columns]
    );

    const virtualizer = useVirtualizer({
        count: rows.length,
        estimateSize: (index) =>
            rows[index]?.kind === 'header' ? estimatedRowHeights.header : estimatedRowHeights.icons,
        getScrollElement: () => scrollerRef.current,
        overscan: overscanRows,
    });

    useScrollToSelection({ rows, selectedIcon, virtualizer });

    return (
        <ScrollShadow
            className={cn(
                variant.heightClassName,
                'channel-icon-swatches mt-3 min-h-0 overflow-y-auto'
            )}
            // Keep HeroUI's measured edge detection: an inactive CSS scroll
            // timeline can retain its old fade after filtering away overflow.
            // Remove when ScrollShadow clears that retained animation state.
            data-scroll-shadow-mode="manual"
            ref={scrollerRef}
            // The catalog previews the Channel, so the chosen color resolves on
            // the grid the same way it does on a rendered Channel mark.
            style={getChannelColorStyle(color)}
        >
            {rows.length === 0 ? (
                <p className="p-2 text-muted text-sm">No icons match.</p>
            ) : (
                <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                    {virtualizer.getVirtualItems().map((item) => (
                        <div
                            className="absolute inset-x-0 top-0"
                            data-index={item.index}
                            key={item.key}
                            ref={virtualizer.measureElement}
                            style={{ transform: `translateY(${item.start}px)` }}
                        >
                            <ChannelIconGridRow
                                columnsClassName={variant.columnsClassName}
                                onSelect={onSelect}
                                row={rows[item.index] as ChannelIconRow}
                                selectedIcon={selectedIcon}
                            />
                        </div>
                    ))}
                </div>
            )}
        </ScrollShadow>
    );
}

function ChannelIconGridRow({
    columnsClassName,
    onSelect,
    row,
    selectedIcon,
}: {
    columnsClassName: string;
    onSelect: (icon: string) => void;
    row: ChannelIconRow;
    selectedIcon: string | null;
}) {
    if (row.kind === 'header') {
        return <h4 className="px-1 pt-2 pb-1 font-medium text-muted text-xs">{row.group}</h4>;
    }

    return (
        <div
            // Each row is its own grid, so `gap` only spaces the columns; the
            // padding carries the matching step between rows.
            className={cn('grid justify-items-center gap-0.5 pb-0.5', columnsClassName)}
        >
            {row.entries.map((entry) => (
                <ChannelIconButton
                    entry={entry}
                    isSelected={entry.name === selectedIcon}
                    key={entry.name}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
}

// Only a screenful of cells is mounted, but each one still re-renders whenever
// the selection moves; memoizing keeps that to the two cells that changed.
const ChannelIconButton = React.memo(function ChannelIconButton({
    entry,
    isSelected,
    onSelect,
}: {
    entry: ChannelIconEntry;
    isSelected: boolean;
    onSelect: (icon: string) => void;
}) {
    return (
        <Button
            aria-label={entry.label}
            aria-pressed={isSelected}
            isIconOnly
            onPress={() => onSelect(entry.name)}
            size="md"
            variant={isSelected ? 'secondary' : 'ghost'}
        >
            <Icon
                icon={entry.glyph}
                size={24}
                // Inline size so the icon-only button's svg rules cannot
                // shrink the glyph back down.
                style={{ height: 24, width: 24 }}
            />
        </Button>
    );
});

/**
 * Puts the channel's icon on screen when the picker opens. Virtualization rules
 * out `scrollIntoView` — the row is usually not mounted — so this asks the
 * virtualizer for the row instead.
 *
 * The reveal is scoped by data rather than by a fired-once flag: it targets the
 * icon the channel already had when the picker opened, and only while `rows` is
 * still the list the picker opened with. Picking an icon leaves `rows`
 * untouched and does not change the target, so the grid never scrolls out from
 * under the user's own click; typing replaces `rows` and ends the reveal. That
 * makes running it twice the same as running it once, which matters because
 * StrictMode remounts the virtualizer and discards the first pass's scroll.
 */
function useScrollToSelection({
    rows,
    selectedIcon,
    virtualizer,
}: {
    rows: readonly ChannelIconRow[];
    selectedIcon: string | null;
    virtualizer: Virtualizer<HTMLDivElement, Element>;
}) {
    const [iconToReveal] = React.useState(selectedIcon);
    const [rowsAtOpen] = React.useState(rows);

    React.useLayoutEffect(() => {
        if (!iconToReveal || rows !== rowsAtOpen) {
            return;
        }

        const index = channelIconRowIndex(rows, iconToReveal);
        if (index === -1) {
            return;
        }

        virtualizer.scrollToIndex(index, { align: 'center' });
    }, [iconToReveal, rows, rowsAtOpen, virtualizer]);
}
