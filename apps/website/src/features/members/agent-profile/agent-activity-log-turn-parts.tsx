import { Button } from '@heroui/react';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { cn } from '../../../lib/utils.ts';
import { serverChatRoute } from '../../servers/server-routes.ts';
import { traceRowClass } from '../../turn-trace/turn-trace-grid.tsx';
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

/**
 * Empty room at the end of the header's title cell, held whether or not the
 * button shows. Beside an open turn's ruler the button lays over the ruler
 * instead, so the title keeps the room except on a narrow log, which has no
 * ruler.
 */
export function ChatButtonRoom({ hasRuler = false }: { hasRuler?: boolean }) {
    return (
        <span
            aria-hidden
            className={cn(
                'ms-auto shrink-0',
                chatRoomClass,
                hasRuler && '@min-2xl/activity-log:hidden'
            )}
        />
    );
}

/** An open turn's ruler steps aside while the Chat button shows over it. */
export const rulerYieldClass = cn(
    'transition-opacity duration-150 motion-reduce:transition-none',
    'group-hover/turn-header:opacity-0 group-has-[:focus-visible]/turn-header:opacity-0'
);

/**
 * The way back to the request's Chat, laid over the room the header holds
 * for it, so revealing it never covers the title or the length. It sits on a
 * copy of the header's grid: at the end of the title cell while the turn is
 * closed, and at the end of an open turn's ruler, which steps aside for it
 * (`rulerYieldClass`). It stays mounted and in the tab order after the
 * header, shown by pointer over the header or keyboard focus on either. A
 * narrow log keeps only its icon.
 */
export function LogChatButton({
    agentName,
    hasRuler = false,
    serverSlug,
    target,
}: {
    agentName: string;
    hasRuler?: boolean;
    serverSlug: string;
    target: { chatId: string; place: string };
}) {
    const navigate = useNavigate();
    const label = turnChatActionLabel(target.place, agentName);
    return (
        <div
            className={cn(
                traceRowClass('default', 'log'),
                'pointer-events-none absolute inset-0',
                'opacity-0 transition-opacity duration-150 motion-reduce:transition-none',
                'focus-within:opacity-100 group-hover/turn-header:opacity-100',
                'group-has-[[data-log-header]:focus-visible]/turn-header:opacity-100'
            )}
        >
            <div
                className={cn(
                    'pointer-events-auto flex justify-end justify-self-end',
                    hasRuler
                        ? '@max-2xl/activity-log:col-start-2 col-start-3'
                        : '@max-2xl/activity-log:col-span-1 col-span-2 col-start-2',
                    chatRoomClass
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
        </div>
    );
}
