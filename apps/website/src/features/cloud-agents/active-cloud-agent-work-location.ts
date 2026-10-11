import {
    type ActiveCloudAgentWork,
    type ActiveCloudAgentWorkLocation,
    activeCloudAgentWorkThreadAnchor,
    type ChatMessage,
} from '@haus/api';

/**
 * Where opening one active work goes (ADR 0044, Q4): its launch work Thread
 * when the viewer can read it, else the newest linking Message the viewer can
 * see. A Server that predates `location` only ever named the work Thread.
 */
export function activeCloudAgentWorkLocation(
    item: ActiveCloudAgentWork
): ActiveCloudAgentWorkLocation {
    return (
        item.location ?? {
            anchorMessageId: activeCloudAgentWorkThreadAnchor(item).id,
            kind: 'work-thread',
            threadChatId: item.threadChatId,
        }
    );
}

/** The work Thread's anchor when the active row already carries it, so the peek needs no read. */
export function carriedWorkThreadAnchor(
    item: ActiveCloudAgentWork,
    anchorMessageId: string
): ChatMessage | undefined {
    return [item.threadAnchorMessage, item.message].find(
        (message): message is ChatMessage => message?.id === anchorMessageId
    );
}
