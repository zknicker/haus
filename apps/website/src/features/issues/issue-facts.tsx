import type { Issue } from '@haus/api';
import { getLocalTimeZone, today } from '@internationalized/date';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useTaskLabels } from '../../hooks/servers/use-task-labels.ts';
import { cn } from '../../lib/utils.ts';
import { useServerContext } from '../servers/server-context.ts';
import { LabelChip } from '../tasks/label-chip.tsx';
import { useIssueActor } from './issue-actor.ts';

export function IssueAssigneeMark({ assignee }: { assignee: Issue['assignee'] }) {
    const { server } = useServerContext();
    const person = useIssueActor(server.id, assignee);
    if (!person) {
        return (
            <span
                aria-label="Unassigned"
                className="border-separator block size-[18px] shrink-0 rounded-full border border-dashed"
                role="img"
            />
        );
    }
    return (
        <span aria-label={person.label} className="shrink-0" role="img" title={person.label}>
            <EntityAvatar name={person.label} size={18} src={person.avatarUrl} />
        </span>
    );
}

export function IssueLabelChips({ labelIds }: { labelIds: readonly string[] }) {
    const { server } = useServerContext();
    const labels = useTaskLabels(server.id, { enabled: labelIds.length > 0 }).data;
    if (labelIds.length === 0 || !labels) {
        return null;
    }
    return labels
        .filter((label) => labelIds.includes(label.id))
        .map((label) => <LabelChip color={label.color} key={label.id} name={label.name} />);
}

export function IssueDueDate({ issue }: { issue: Pick<Issue, 'closedAt' | 'dueOn'> }) {
    if (!issue.dueOn) {
        return null;
    }
    return (
        <span className={cn('shrink-0 text-xs', isOverdue(issue) ? 'text-danger' : 'text-muted')}>
            {formatDueOn(issue.dueOn)}
        </span>
    );
}

export function IssueSubProgress({
    issue,
}: {
    issue: Pick<Issue, 'closedSubIssueCount' | 'subIssueCount'>;
}) {
    if (issue.subIssueCount === 0) {
        return null;
    }
    return (
        <span
            aria-label={`${issue.closedSubIssueCount} of ${issue.subIssueCount} sub-issues closed`}
            className="text-muted shrink-0 text-xs tabular-nums"
        >
            {issue.closedSubIssueCount}/{issue.subIssueCount}
        </span>
    );
}

export function formatDueOn(dueOn: string) {
    return dueFormat.format(new Date(`${dueOn}T00:00:00`));
}

export function isOverdue({ closedAt, dueOn }: Pick<Issue, 'closedAt' | 'dueOn'>) {
    return dueOn !== null && closedAt === null && dueOn < today(getLocalTimeZone()).toString();
}

const dueFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
