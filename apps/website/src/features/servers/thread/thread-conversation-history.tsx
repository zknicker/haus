import { Button } from '@heroui/react';
import type { ThreadInlineReplyHistory } from './thread-inline-replies.ts';

/** History controls serve both sources without dividing the conversation into sections. */
export function ThreadConversationHistory({
    inline,
    thread,
}: {
    inline?: ThreadInlineReplyHistory;
    thread: {
        error: Error | null;
        hasOlderHistory: boolean;
        isFetchingOlderHistory: boolean;
        fetchOlderHistory: () => unknown;
        refetch: () => unknown;
    };
}) {
    const failed = Boolean(inline?.error || thread.error);
    const hasOlder = Boolean(inline?.hasOlder || thread.hasOlderHistory);
    const loading = Boolean(inline?.isFetching || thread.isFetchingOlderHistory);
    if (!(failed || hasOlder)) {
        return null;
    }
    return (
        <div className="mb-4 flex items-center justify-center gap-3">
            {failed ? (
                <>
                    <p className="text-danger text-sm">Some messages could not be loaded.</p>
                    <Button
                        onPress={() => {
                            if (inline?.error) {
                                inline.retry();
                            }
                            if (thread.error) {
                                void thread.refetch();
                            }
                        }}
                        size="sm"
                        variant="outline"
                    >
                        Try again
                    </Button>
                </>
            ) : null}
            {hasOlder ? (
                <Button
                    isDisabled={loading}
                    onPress={() => {
                        if (inline?.hasOlder) {
                            inline.fetchOlder();
                        }
                        if (thread.hasOlderHistory) {
                            void thread.fetchOlderHistory();
                        }
                    }}
                    size="sm"
                    variant="ghost"
                >
                    {loading ? 'Loading older replies…' : 'Load older replies'}
                </Button>
            ) : null}
        </div>
    );
}
