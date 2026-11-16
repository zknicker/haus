import * as React from 'react';

export type ClaimSelectMode = 'toggle' | 'range';

export interface ClaimSelection {
    clear: () => void;
    isSelected: (id: string) => boolean;
    select: (id: string, mode: ClaimSelectMode) => void;
    selectedIds: ReadonlySet<string>;
    selectionActive: boolean;
}

/**
 * Board multi-select over the current ordered claim ids. Toggle adds or removes a
 * single row and moves the range anchor; range extends the selection from the
 * anchor to the clicked row in board order (shift-click). Selection is pruned to
 * ids still present so filtering or refetch never leaves phantom rows selected.
 */
export function useClaimSelection(orderedIds: string[]): ClaimSelection {
    const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(() => new Set());
    const anchorRef = React.useRef<string | null>(null);
    const orderedRef = React.useRef(orderedIds);
    orderedRef.current = orderedIds;

    React.useEffect(() => {
        setSelectedIds((prev) => {
            if (prev.size === 0) {
                return prev;
            }

            const present = new Set(orderedIds);
            const next = new Set([...prev].filter((id) => present.has(id)));

            return next.size === prev.size ? prev : next;
        });
    }, [orderedIds]);

    const select = React.useCallback((id: string, mode: ClaimSelectMode) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);

            if (mode === 'range' && anchorRef.current) {
                const order = orderedRef.current;
                const from = order.indexOf(anchorRef.current);
                const to = order.indexOf(id);

                if (from !== -1 && to !== -1) {
                    const [start, end] = from < to ? [from, to] : [to, from];

                    for (let index = start; index <= end; index += 1) {
                        next.add(order[index]);
                    }

                    return next;
                }
            }

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
        anchorRef.current = id;
    }, []);

    const clear = React.useCallback(() => {
        setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
        anchorRef.current = null;
    }, []);

    const isSelected = React.useCallback((id: string) => selectedIds.has(id), [selectedIds]);

    return {
        clear,
        isSelected,
        select,
        selectedIds,
        selectionActive: selectedIds.size > 0,
    };
}
