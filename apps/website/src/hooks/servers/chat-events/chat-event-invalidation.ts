import type { QueryClient } from '@tanstack/react-query';
import type { hausTrpc } from '../../../lib/haus-server.tsx';
import type { ChatEventOf, ChatEventType } from './chat-event-registry.ts';

/** The tRPC cache handle every Chat event listener invalidates through. */
export type ChatEventUtils = Pick<
    ReturnType<typeof hausTrpc.useUtils>,
    'agent' | 'ask' | 'chat' | 'cloudAgentWork' | 'task' | 'taskLabel'
>;

/** What one listener needs to invalidate the reads its own events change. */
export interface ChatEventInvalidation<Type extends ChatEventType> {
    events: ChatEventOf<Type>[];
    queryClient: QueryClient;
    serverId: string;
    utils: ChatEventUtils;
}

/** One pass refetches a Chat's read once, however many of its events arrived. */
export function uniqueChatIds(chatIds: readonly string[]): string[] {
    return [...new Set(chatIds)];
}
