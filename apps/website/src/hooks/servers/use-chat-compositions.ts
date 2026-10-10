import type { CompositionEvent } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useSubscriptionRestart } from '../realtime/use-subscription-restart.ts';
import { useMembers } from './use-members.ts';
import { visibleCompositions } from './visible-compositions.ts';

export function useChatCompositions(serverId: string | undefined, chatId: string | undefined) {
    const scope = `${serverId ?? ''}:${chatId ?? ''}`;
    const [compositionState, setCompositionState] = React.useState<{
        events: CompositionEvent[];
        scope: string;
    }>({ events: [], scope });
    const directory = useMembers(serverId);
    const live = compositionState.scope === scope ? compositionState.events : [];
    // Volatile composition stays component-local; the durable member directory
    // decides who is still allowed to appear in it.
    const compositions = visibleCompositions(
        live,
        directory.data?.members.map((member) => member.userId)
    );

    const restart = useSubscriptionRestart('chat.onComposition', serverId, undefined, scope);
    const { reset } = hausTrpc.chat.onComposition.useSubscription(
        { chatId: chatId ?? '', serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && chatId !== undefined && restart.open,
            onComplete: () => restart.completed(reset),
            onError: (error) => restart.failed(error, reset),
            onStarted: restart.started,
            onData: (event) => {
                setCompositionState((current) => {
                    const currentEvents = current.scope === scope ? current.events : [];
                    const withoutActor = currentEvents.filter(
                        (composition) => composition.actorUserId !== event.actorUserId
                    );
                    return {
                        events: event.text === null ? withoutActor : [...withoutActor, event],
                        scope,
                    };
                });
            },
        }
    );

    return compositions;
}
