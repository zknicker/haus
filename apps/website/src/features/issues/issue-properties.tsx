import type { Issue } from '@haus/api';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import { Button, Calendar, DatePicker, ListBox } from '@heroui/react';
import { Calendar03Icon, Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { parseDate } from '@internationalized/date';
import type * as React from 'react';
import { EntityName } from '../../components/ui/entity-name.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useTaskLabels } from '../../hooks/servers/use-task-labels.ts';
import { cn } from '../../lib/utils.ts';
import {
    issueActorFromKey,
    issueActorKey,
    unassignedKey,
    useIssueActor,
    useIssueAssigneeChoices,
} from './issue-actor.ts';
import { formatDueOn, IssueLabelChips, isOverdue } from './issue-facts.tsx';
import { IssuePriorityIcon, IssueStateDisc } from './issue-glyphs.tsx';
import {
    LabelListBox,
    PersonItems,
    PlainItem,
    PriorityListBox,
    StateListBox,
} from './issue-list-boxes.tsx';
import {
    isIssuePriority,
    isIssueState,
    issuePriorityLabels,
    issueStateLabels,
} from './issue-state.ts';
import { useIssuePatch } from './use-issue-patch.ts';

export function IssueProperties({ issue }: { issue: Issue }) {
    return (
        <div className="issue-properties">
            <IssueStateSelect issue={issue} />
            <IssuePrioritySelect issue={issue} />
            <IssueAssigneeSelect issue={issue} />
            <IssueDuePicker issue={issue} />
            <IssueLabelsPicker issue={issue} />
        </div>
    );
}

function IssueStateSelect({ issue }: { issue: Issue }) {
    const patch = useIssuePatch();
    return (
        <InlineSelect
            aria-label="Status"
            onChange={(next) => {
                if (isIssueState(next) && next !== issue.state.id) {
                    patch(issue, { state: next });
                }
            }}
            value={issue.state.id}
        >
            <InlineSelect.Trigger className="gap-1.5">
                <IssueStateDisc state={issue.state.id} />
                <span className="truncate text-sm">{issueStateLabels[issue.state.id]}</span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-44" placement="bottom start">
                <StateListBox />
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

function IssuePrioritySelect({ issue }: { issue: Issue }) {
    const patch = useIssuePatch();
    return (
        <InlineSelect
            aria-label="Priority"
            onChange={(next) => {
                if (isIssuePriority(next) && next !== issue.priority) {
                    patch(issue, { priority: next });
                }
            }}
            value={issue.priority}
        >
            <InlineSelect.Trigger className="gap-1.5">
                <IssuePriorityIcon className="text-muted" priority={issue.priority} />
                <span className="truncate text-sm">{issuePriorityLabels[issue.priority]}</span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-44" placement="bottom start">
                <PriorityListBox />
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

function IssueAssigneeSelect({ issue }: { issue: Issue }) {
    const patch = useIssuePatch();
    const people = useIssueAssigneeChoices(issue.serverId);
    const current = useIssueActor(issue.serverId, issue.assignee);
    const currentKey = issueActorKey(issue.assignee);
    const choices =
        current && !people.some((person) => person.key === current.key)
            ? [current, ...people]
            : people;
    return (
        <InlineSelect
            aria-label="Assignee"
            onChange={(next) => {
                const key = String(next);
                if (next !== null && key !== currentKey) {
                    patch(issue, { assignee: issueActorFromKey(key) });
                }
            }}
            value={currentKey}
        >
            <InlineSelect.Trigger className="gap-1.5">
                {current ? (
                    <EntityName
                        avatarUrl={current.avatarUrl}
                        className="text-sm"
                        name={current.label}
                        size={18}
                    />
                ) : (
                    <span className="text-muted truncate text-sm">Unassigned</span>
                )}
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-64" placement="bottom start">
                <ListBox>
                    <PlainItem id={unassignedKey} label="Unassigned" />
                    <PersonItems people={choices} />
                </ListBox>
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

function IssueDuePicker({ issue }: { issue: Issue }) {
    const patch = useIssuePatch();
    return (
        <span className="flex min-w-0 items-center">
            <DatePicker
                aria-label="Due date"
                onChange={(value) => value && patch(issue, { dueOn: value.toString() })}
                value={issue.dueOn ? parseDate(issue.dueOn) : null}
            >
                <DatePicker.Trigger>
                    <Icon
                        aria-hidden="true"
                        className="text-muted"
                        icon={Calendar03Icon}
                        size={15}
                    />
                    <span
                        className={cn(
                            'text-sm',
                            issue.dueOn === null && 'text-muted',
                            isOverdue(issue) && 'text-danger'
                        )}
                    >
                        {issue.dueOn ? formatDueOn(issue.dueOn) : 'Due date'}
                    </span>
                </DatePicker.Trigger>
                <DatePicker.Popover>
                    <DueCalendar />
                </DatePicker.Popover>
            </DatePicker>
            {issue.dueOn ? (
                <Button
                    aria-label="Clear due date"
                    isIconOnly
                    onPress={() => patch(issue, { dueOn: null })}
                    size="sm"
                    variant="ghost"
                >
                    <Icon aria-hidden="true" icon={Cancel01Icon} size={14} />
                </Button>
            ) : null}
        </span>
    );
}

function DueCalendar() {
    return (
        <Calendar aria-label="Due date">
            <Calendar.Header>
                <Calendar.Heading />
                <Calendar.NavButton slot="previous" />
                <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
                <Calendar.GridHeader>
                    {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                </Calendar.GridHeader>
                <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
            </Calendar.Grid>
        </Calendar>
    );
}

function IssueLabelsPicker({ issue }: { issue: Issue }) {
    const labels = useTaskLabels(issue.serverId).data ?? [];
    const patch = useIssuePatch();
    if (labels.length === 0 && issue.labelIds.length === 0) {
        return null;
    }
    return (
        <InlineSelect
            aria-label="Labels"
            onChange={(keys) => patch(issue, { labelIds: (keys as React.Key[]).map(String) })}
            selectionMode="multiple"
            value={issue.labelIds}
        >
            <InlineSelect.Trigger className="h-auto gap-1.5">
                {issue.labelIds.length > 0 ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-1">
                        <IssueLabelChips labelIds={issue.labelIds} />
                    </span>
                ) : (
                    <span className="text-muted truncate text-sm">Labels</span>
                )}
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-56" placement="bottom start">
                <LabelListBox labels={labels} selectionMode="multiple" />
            </InlineSelect.Popover>
        </InlineSelect>
    );
}
