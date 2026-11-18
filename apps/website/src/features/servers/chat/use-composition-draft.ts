import * as React from 'react';
import { useChatCompositionPublish } from '../../../hooks/servers/use-chat-composition-publish.ts';

export function useCompositionDraft({
    chatId,
    draft,
    serverId,
}: {
    chatId: string | undefined;
    draft: string;
    serverId: string;
}) {
    const [compositionId] = React.useState(() => crypto.randomUUID());
    const publish = useChatCompositionPublish().mutate;

    React.useEffect(() => {
        if (draft.length === 0 || chatId === undefined) {
            return;
        }
        const timeout = window.setTimeout(() => {
            publish({ chatId, compositionId, serverId, text: draft });
        }, 150);
        return () => window.clearTimeout(timeout);
    }, [chatId, compositionId, draft, publish, serverId]);

    React.useEffect(
        () => () => {
            if (chatId) {
                publish({ chatId, compositionId, serverId, text: null });
            }
        },
        [chatId, compositionId, publish, serverId]
    );

    return React.useCallback(() => {
        if (chatId) {
            publish({ chatId, compositionId, serverId, text: null });
        }
    }, [chatId, compositionId, publish, serverId]);
}
