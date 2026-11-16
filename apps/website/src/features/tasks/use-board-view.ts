import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { type BoardFilters, type BoardLayout, resolveBoardLayout } from './board-view.ts';

/**
 * The lens and filters of a board, in its URL so a link, a reload, and Back all
 * keep them. Each reader takes this hook; the band's lens toggle and the page
 * under it share the address, not a provider.
 */
export function useBoardView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const assignee = searchParams.get('assignee');
    const labelId = searchParams.get('label');
    const layout = resolveBoardLayout(searchParams.get('view'));
    const filters = React.useMemo<BoardFilters>(() => ({ assignee, labelId }), [assignee, labelId]);
    const setParam = React.useCallback(
        (name: string, value: null | string) => {
            setSearchParams(
                (current) => {
                    const next = new URLSearchParams(current);
                    if (value === null) {
                        next.delete(name);
                    } else {
                        next.set(name, value);
                    }
                    return next;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    return {
        filters,
        layout,
        setAssignee: (value: null | string) => setParam('assignee', value),
        setLabelId: (value: null | string) => setParam('label', value),
        setLayout: (value: BoardLayout) => setParam('view', value === 'list' ? value : null),
    };
}
