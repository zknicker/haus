import { Button } from '@heroui/react';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { cn } from '../../../lib/utils.ts';
import { serverChatRoute } from '../../servers/server-routes.ts';
import { traceRowClass } from '../../turn-trace/turn-trace-grid.tsx';
import { TraceRuler } from '../../turn-trace/turn-trace-ruler.tsx';
import type { TraceScale } from '../../turn-trace/turn-trace-scale.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { type TurnRowTitle, turnChatActionLabel } from './agent-turn-row-model.ts';

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
 * Room at the end of a narrow log's title, which has no track column for the
 * Chat button: the title truncates before the button, never under it.
 */
export function ChatButtonRoom() {
    return <span aria-hidden className="ms-auto @min-2xl/activity-log:hidden w-8 shrink-0" />;
}

/**
 * An open turn's ruler, on its own thin row under the header: only the track
 * column, never a tab stop. The step rows carry its ticks down as gridlines.
 */
export function TurnRuler({ scale }: { scale: TraceScale }) {
    return (
        <div
            aria-hidden
            className={cn(
                traceRowClass('default', 'log'),
                'pointer-events-none @max-2xl/activity-log:hidden h-5 min-h-0'
            )}
            data-log-ruler
        >
            <TraceRuler className="col-start-3" scale={scale} />
        </div>
    );
}

/**
 * The way back to the request's Chat, laid over a copy of the header's grid
 * at the end of its empty track column, so revealing it covers and fades
 * nothing. It stays mounted and in the tab order after the header, shown by
 * pointer over the header or keyboard focus on either. A narrow log has no
 * track, so it keeps only its icon, in room at the end of the title.
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
                traceRowClass('default', 'log'),
                'pointer-events-none absolute inset-0',
                'opacity-0',
                'focus-within:opacity-100 group-hover/turn-header:opacity-100',
                'group-has-[[data-log-header]:focus-visible]/turn-header:opacity-100'
            )}
        >
            <div className="pointer-events-auto @max-2xl/activity-log:col-start-2 col-start-3 flex justify-self-end">
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
