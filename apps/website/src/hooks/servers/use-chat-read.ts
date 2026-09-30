import * as React from 'react';
import { useCoveringTabSelected } from '../../features/shell/browser-workspace-context.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useAppForegrounded } from '../shell/use-app-foregrounded.ts';

export interface ChatReadAttemptTarget {
    chatKey: string;
    requestKey: string;
    sequence: number;
}

export interface ChatReadAttemptTracker {
    begin: (target: ChatReadAttemptTarget) => void;
    canAttempt: (target: ChatReadAttemptTarget) => boolean;
    fail: (target: ChatReadAttemptTarget) => void;
    succeed: (target: ChatReadAttemptTarget, sequence: number) => void;
}

export function createChatReadAttemptTracker(): ChatReadAttemptTracker {
    const attempted = new Set<string>();
    const markedByChat = new Map<string, number>();

    return {
        canAttempt(target) {
            const markedSequence = markedByChat.get(target.chatKey);

            return (
                !attempted.has(target.requestKey) &&
                (markedSequence === undefined || target.sequence > markedSequence)
            );
        },
        begin(target) {
            attempted.add(target.requestKey);
        },
        fail(target) {
            attempted.delete(target.requestKey);
        },
        succeed(target, sequence) {
            attempted.delete(target.requestKey);
            const markedSequence = markedByChat.get(target.chatKey);

            if (markedSequence === undefined || sequence > markedSequence) {
                markedByChat.set(target.chatKey, sequence);
            }
        },
    };
}

export function canMarkChatRead(input: {
    chatId: string | undefined;
    enabled?: boolean;
    foregrounded: boolean;
    sequence: number | undefined;
    serverId: string | undefined;
}) {
    return (
        (input.enabled ?? true) &&
        input.foregrounded &&
        input.chatId !== undefined &&
        input.sequence !== undefined &&
        input.serverId !== undefined
    );
}

function chatReadTarget(input: { chatId: string; sequence: number; serverId: string }) {
    const chatKey = `${input.serverId}:${input.chatId}`;

    return {
        chatKey,
        requestKey: `${chatKey}:${input.sequence}`,
        sequence: input.sequence,
    } satisfies ChatReadAttemptTarget;
}

export function useChatRead(input: {
    chatId: string | undefined;
    enabled?: boolean;
    sequence: number | undefined;
    serverId: string | undefined;
}) {
    const foregrounded = useAppForegrounded();
    const workspaceTabActive = useCoveringTabSelected();
    const attemptTrackerRef = React.useRef(createChatReadAttemptTracker());
    const attemptTracker = attemptTrackerRef.current;
    // The durable `chat.read` event owns unread-count invalidation; see useChatEvents.
    const mutation = hausTrpc.chat.markRead.useMutation({
        onError: (_error, variables) => {
            attemptTracker.fail(chatReadTarget(variables));
        },
        onSuccess: (receipt, variables) => {
            attemptTracker.succeed(chatReadTarget(variables), receipt.sequence);
        },
        retry: 2,
    });
    const mutate = mutation.mutate;
    const [retryGeneration, setRetryGeneration] = React.useState(0);
    const eligible = canMarkChatRead({
        ...input,
        enabled: input.enabled !== false && !workspaceTabActive,
        foregrounded,
    });
    const request = React.useMemo(
        () =>
            eligible &&
            input.chatId !== undefined &&
            input.sequence !== undefined &&
            input.serverId !== undefined
                ? {
                      chatId: input.chatId,
                      sequence: input.sequence,
                      serverId: input.serverId,
                  }
                : null,
        [eligible, input.chatId, input.sequence, input.serverId]
    );
    const requestKey = request ? chatReadTarget(request).requestKey : null;
    const retryKey = requestKey === null ? null : `${requestKey}:${retryGeneration}`;

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const handleOnline = () => setRetryGeneration((generation) => generation + 1);
        window.addEventListener('online', handleOnline);

        return () => window.removeEventListener('online', handleOnline);
    }, []);

    React.useEffect(() => {
        if (!(request && retryKey)) {
            return;
        }

        const target = chatReadTarget(request);

        if (!attemptTracker.canAttempt(target)) {
            return;
        }

        attemptTracker.begin(target);
        mutate(request);
    }, [attemptTracker, mutate, request, retryKey]);

    return mutation;
}
