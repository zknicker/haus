import type { Issue } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { Disclosure } from '@heroui/react';
import * as React from 'react';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { taskAge } from '../tasks/tasks-page-model.ts';
import {
    IssueAssigneeMark,
    IssueDueDate,
    IssueLabelChips,
    IssueSubProgress,
} from './issue-facts.tsx';
import { IssuePriorityMark, IssueStateDisc, IssueStateMark } from './issue-glyphs.tsx';
import { IssueMenu } from './issue-menu.tsx';
import { issueStateLabels } from './issue-state.ts';
import { groupIssuesByState, type IssueStateGroup } from './issues-page-model.ts';
import { useOpenIssue } from './use-open-issue.ts';

export function IssueList({ issues }: { issues: readonly Issue[] }) {
    const now = useRelativeNow(60_000);
    const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set());
    return (
        <div className="issue-list">
            {groupIssuesByState(issues).map((group) => (
                <IssueStateSection
                    expanded={!collapsed.has(group.state)}
                    group={group}
                    key={group.state}
                    now={now}
                    onExpandedChange={(expanded) =>
                        setCollapsed((current) => toggled(current, group.state, !expanded))
                    }
                />
            ))}
        </div>
    );
}

function IssueStateSection({
    expanded,
    group,
    now,
    onExpandedChange,
}: {
    expanded: boolean;
    group: IssueStateGroup;
    now: number;
    onExpandedChange: (expanded: boolean) => void;
}) {
    const openIssue = useOpenIssue();
    const label = issueStateLabels[group.state];
    return (
        <Disclosure
            className="issue-list__group"
            isExpanded={expanded}
            onExpandedChange={onExpandedChange}
        >
            <Disclosure.Heading>
                <Disclosure.Trigger>
                    <IssueStateDisc state={group.state} />
                    {label}
                    <span className="task-list__group-count">{group.issues.length}</span>
                    <Disclosure.Indicator />
                </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
                <ListView
                    aria-label={`${label} issues`}
                    className="task-list"
                    onAction={(key) => {
                        const issue = group.issues.find((candidate) => candidate.id === key);
                        if (issue) {
                            openIssue(issue);
                        }
                    }}
                    variant="secondary"
                >
                    {group.issues.map((issue) => (
                        <IssueRow issue={issue} key={issue.id} now={now} />
                    ))}
                </ListView>
            </Disclosure.Content>
        </Disclosure>
    );
}

function IssueRow({ issue, now }: { issue: Issue; now: number }) {
    return (
        <ListView.Item id={issue.id} textValue={`${issue.code} ${issue.title}`}>
            <ListView.ItemContent>
                <IssueStateMark state={issue.state.id} />
                <span className="task-list__key">{issue.code}</span>
                <ListView.Title className="min-w-0">{issue.title}</ListView.Title>
                <IssueSubProgress issue={issue} />
                <span className="task-list__labels">
                    <IssueLabelChips labelIds={issue.labelIds} />
                </span>
            </ListView.ItemContent>
            <ListView.ItemAction>
                <span className="task-list__facts">
                    <IssueDueDate issue={issue} />
                    <IssuePriorityMark priority={issue.priority} />
                    <IssueAssigneeMark assignee={issue.assignee} />
                    <span
                        className="task-list__age"
                        title={`Created ${createdFormat.format(new Date(issue.createdAt))}`}
                    >
                        {taskAge(issue, now)}
                    </span>
                    <span className="task-list__menu">
                        <IssueMenu issue={issue} />
                    </span>
                </span>
            </ListView.ItemAction>
        </ListView.Item>
    );
}

function toggled(current: ReadonlySet<string>, state: string, collapse: boolean) {
    const next = new Set(current);
    if (collapse) {
        next.add(state);
    } else {
        next.delete(state);
    }
    return next;
}

const createdFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
});
