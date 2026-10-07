import { Button } from '@heroui/react';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { cn } from '../../../lib/utils.ts';
import { serverChatRoute } from '../../servers/server-routes.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { type TurnRowTitle, turnChatActionLabel } from './agent-turn-row-model.ts';

/** The header room the Chat button needs: the title truncates before it, never under it. */
const chatRoomClass = 'w-52 @max-2xl/activity-log:w-8';

/** The way back to a turn's request, when it came from a Chat someone can open. */
export function readChatTarget(
    title: TurnRowTitle,
    trigger: AgentActivityTurn['trigger']
): { chatId: string; place: string } | null {
    return trigger && trigger.kind !== 'private' && title.kind === 'text' && title.place
        ? { chatId: trigger.chatId, place: title.place }
        : null;
}

/** Empty room at the end of the header's title cell, held whether or not the button shows. */
export function ChatButtonRoom() {
    return <span aria-hidden className={cn('ms-auto shrink-0', chatRoomClass)} />;
}

/**
 * The way back to the request's Chat, laid over
 * the room the header holds for it, so revealing it never covers the title or
 * the length. It stays mounted and in the tab order after the header, shown
 * by pointer over the header or keyboard focus on either. A narrow log keeps
 * only its icon.
 */
export function LogChatButton({
    agentName,
    serverSlug,
    target,
}: {
    agentName: string;
    serverSlug: string;
    target: { chatId: string; place: string };
}) {
    const navigate = useNavigate();
    const label = turnChatActionLabel(target.place, agentName);
    return (
        <div
            className={cn(
                // Past the duration and slot columns, ending where the room ends.
                'absolute inset-y-0 end-[calc(var(--trace-pad)+var(--spacing)*4+4.75rem)] flex items-center justify-end',
                '@max-2xl/activity-log:end-[calc(var(--trace-pad)+var(--spacing)*4+4rem)]',
                chatRoomClass,
                'opacity-0 transition-opacity duration-150 motion-reduce:transition-none',
                'focus-within:opacity-100 group-hover/turn-header:opacity-100',
                'group-has-[[data-log-header]:focus-visible]/turn-header:opacity-100'
            )}
        >
            <Button
                aria-label={label}
                onPress={() => navigate(serverChatRoute(serverSlug, target.chatId))}
                size="sm"
                variant="ghost"
            >
                <span className="@max-2xl/activity-log:sr-only truncate">{label}</span>
                <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
            </Button>
        </div>
    );
}
