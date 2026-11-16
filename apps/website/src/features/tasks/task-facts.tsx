import type { Task } from '@haus/api';
import { getLocalTimeZone, today } from '@internationalized/date';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useOptionalCurrentAgentActivity } from '../../hooks/agents/use-current-agent-activity.tsx';
import { useTaskLabels } from '../../hooks/servers/use-task-labels.ts';
import { cn } from '../../lib/utils.ts';
import { useServerContext } from '../servers/server-context.ts';
import { LabelChip } from './label-chip.tsx';
import { useTaskActor } from './use-task-people.ts';

/**
 * The small facts a card and a list row share. Each is its own leaf, so a
 * label rename or an Agent's turn repaints the fact and not the row around it.
 */

/** Who holds the Task: their mark, or an empty ring for nobody. */
export function TaskAssigneeMark({ assignee }: { assignee: Task['assignee'] }) {
    const { server } = useServerContext();
    const person = useTaskActor(server.id, assignee);
    if (!person) {
        return (
            <span
                aria-hidden="true"
                className="block size-[18px] shrink-0 rounded-full border border-separator border-dashed"
                title="Unassigned"
            />
        );
    }
    return (
        <span className="shrink-0" title={person.label}>
            <EntityAvatar name={person.label} size={18} src={person.avatarUrl} />
        </span>
    );
}

/** The assignee Agent is running a turn while this Task sits in an active column. */
export function TaskWorkingMark({ task }: { task: Pick<Task, 'assignee' | 'category'> }) {
    const agentId = task.assignee?.kind === 'agent' ? task.assignee.agentId : null;
    if (agentId === null || task.category !== 'active') {
        return null;
    }
    return <AgentWorkingMark agentId={agentId} />;
}

function AgentWorkingMark({ agentId }: { agentId: string }) {
    const activity = useOptionalCurrentAgentActivity();
    if (!activity?.activities.some((entry) => entry.agentId === agentId)) {
        return null;
    }
    return (
        <span className="flex shrink-0 items-center gap-1 text-success text-xs">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            Working
        </span>
    );
}

export function TaskLabelChips({ labelIds }: { labelIds: readonly string[] }) {
    const { server } = useServerContext();
    const labels = useTaskLabels(server.id, { enabled: labelIds.length > 0 }).data;
    if (labelIds.length === 0 || !labels) {
        return null;
    }
    return labels
        .filter((label) => labelIds.includes(label.id))
        .map((label) => <LabelChip color={label.color} key={label.id} name={label.name} />);
}

/** The display-only due date: short, and red once it has passed on open work. */
export function TaskDueDate({ task }: { task: Pick<Task, 'completedAt' | 'dueOn'> }) {
    const overdue = isOverdue(task);
    if (!task.dueOn) {
        return null;
    }
    return (
        <span className={cn('shrink-0 text-xs', overdue ? 'text-danger' : 'text-muted')}>
            {formatDueOn(task.dueOn)}
        </span>
    );
}

export function formatDueOn(dueOn: string) {
    return dueFormat.format(new Date(`${dueOn}T00:00:00`));
}

const dueFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

function isOverdue({ completedAt, dueOn }: Pick<Task, 'completedAt' | 'dueOn'>) {
    return dueOn !== null && completedAt === null && dueOn < today(getLocalTimeZone()).toString();
}
