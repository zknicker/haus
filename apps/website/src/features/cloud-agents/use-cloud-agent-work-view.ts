import { useSearchParams } from 'react-router-dom';

/**
 * Which Cloud Agent work is peeked open. `?work=<messageId>` makes it a deep
 * link and Back closes it — the same contract `?task=` gives
 * the Tasks page.
 */
export function useCloudAgentWorkView() {
    const [searchParams, setSearchParams] = useSearchParams();

    return {
        // Close replaces so Back from a closed dialog leaves the page; open
        // pushes an entry so Back closes an open dialog.
        closeWork: () => {
            setSearchParams(
                (params) => {
                    const next = new URLSearchParams(params);
                    next.delete('work');
                    return next;
                },
                { replace: true }
            );
        },
        openWork: (messageId: string) => {
            setSearchParams((params) => {
                const next = new URLSearchParams(params);
                next.set('work', messageId);
                return next;
            });
        },
        openWorkId: searchParams.get('work'),
    };
}
