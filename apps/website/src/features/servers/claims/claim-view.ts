import { useSearchParams } from 'react-router-dom';
import { type ClaimView, resolveClaimView } from './claim-model.ts';

export type ClaimLayout = 'board' | 'list';

export function useClaimView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const layout = searchParams.get('layout') === 'board' ? 'board' : 'list';

    return {
        // Close deletes with replace so Back from a closed dialog leaves the
        // page; open pushes an entry so Back closes an open dialog.
        closeClaim: () => {
            setSearchParams(
                (params) => {
                    const next = new URLSearchParams(params);
                    next.delete('claim');
                    return next;
                },
                { replace: true }
            );
        },
        filters: {
            assignee: searchParams.get('assignee'),
            /**
             * Widens the lens past the background tier. Off by default, so an
             * Agent's own bookkeeping never crowds the surface a person reads;
             * carried in the URL because it is a deliberate widening.
             */
            background: searchParams.get('background') === 'on',
            chatId: searchParams.get('chat'),
            labelId: searchParams.get('label'),
            priority: searchParams.get('priority'),
            status: searchParams.get('status'),
            view: resolveClaimView(searchParams.get('view')),
        },
        layout,
        openClaim: (messageId: string) => {
            setSearchParams((params) => {
                const next = new URLSearchParams(params);
                next.set('claim', messageId);
                return next;
            });
        },
        openClaimId: searchParams.get('claim'),
        setAssignee: (assignee: null | string) => {
            setSearchParams(
                (params) => {
                    const next = new URLSearchParams(params);
                    if (assignee) {
                        next.set('assignee', assignee);
                    } else {
                        next.delete('assignee');
                    }
                    return next;
                },
                { replace: true }
            );
        },
        setBackground: (background: boolean) => {
            setSearchParams(
                (params) => {
                    const next = new URLSearchParams(params);
                    if (background) {
                        next.set('background', 'on');
                    } else {
                        next.delete('background');
                    }
                    return next;
                },
                { replace: true }
            );
        },
        setPriority: (priority: null | string) => {
            setSearchParams(
                (params) => {
                    const next = new URLSearchParams(params);
                    if (priority) {
                        next.set('priority', priority);
                    } else {
                        next.delete('priority');
                    }
                    return next;
                },
                { replace: true }
            );
        },
        setStatus: (status: null | string) => {
            setSearchParams(
                (params) => {
                    const next = new URLSearchParams(params);
                    if (status) {
                        next.set('status', status);
                    } else {
                        next.delete('status');
                    }
                    return next;
                },
                { replace: true }
            );
        },
        setLabelId: (labelId: null | string) => {
            setSearchParams(
                (params) => {
                    const next = new URLSearchParams(params);
                    if (labelId) {
                        next.set('label', labelId);
                    } else {
                        next.delete('label');
                    }
                    return next;
                },
                { replace: true }
            );
        },
        setView: (view: ClaimView) => {
            setSearchParams(
                (params) => {
                    const next = new URLSearchParams(params);
                    if (view === 'active') {
                        next.delete('view');
                    } else {
                        next.set('view', view);
                    }
                    return next;
                },
                { replace: true }
            );
        },
        setChatId: (chatId: string | null) => {
            setSearchParams(
                (params) => {
                    const next = new URLSearchParams(params);
                    if (chatId) {
                        next.set('chat', chatId);
                    } else {
                        next.delete('chat');
                    }
                    return next;
                },
                { replace: true }
            );
        },
        setLayout: (nextLayout: ClaimLayout) => {
            setSearchParams(
                (params) => {
                    const next = new URLSearchParams(params);
                    if (nextLayout === 'list') {
                        next.delete('layout');
                    } else {
                        next.set('layout', nextLayout);
                    }
                    return next;
                },
                { replace: true }
            );
        },
    };
}
