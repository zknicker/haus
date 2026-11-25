import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { cn } from '../../../lib/utils.ts';
import type { ActivityLogAgent } from './agent-activity-log-entries.ts';
import { ChatButtonRoom } from './agent-activity-log-turn-parts.tsx';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import type { TurnRowStatus, TurnRowTitle } from './agent-turn-row-model.ts';
import { TurnRowTitleLine, TurnStatusGlyph } from './agent-turn-row.tsx';

export function TurnHeaderLabel({
    agent,
    hasChat,
    status,
    title,
    turn,
}: {
    agent: ActivityLogAgent | null;
    hasChat: boolean;
    status: TurnRowStatus;
    title: TurnRowTitle;
    turn: AgentActivityTurn;
}) {
    return (
        <>
            <span
                className={cn(
                    'flex min-w-0 items-center gap-2 font-medium',
                    !hasChat && '@min-2xl/activity-log:col-span-2'
                )}
            >
                <span className="flex w-4 shrink-0 justify-center">
                    {status ? <TurnStatusGlyph status={status} /> : null}
                </span>
                {agent ? (
                    <span className="flex w-24 shrink-0 items-center gap-1.5">
                        <EntityAvatar name={agent.displayName} size={16} src={agent.avatarUrl} />
                        <span className="min-w-0 truncate">{agent.displayName}</span>
                    </span>
                ) : null}
                <TurnRowTitleLine
                    count={status?.kind === 'failed' ? status.count : 1}
                    title={title}
                    turn={turn}
                />
                {hasChat ? <ChatButtonRoom /> : null}
            </span>
            {hasChat ? (
                <span
                    aria-hidden
                    className="@max-2xl/activity-log:hidden"
                    data-trace-cell="track"
                />
            ) : null}
        </>
    );
}
