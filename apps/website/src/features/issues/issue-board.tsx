import type { Issue, IssueState } from '@haus/api';
import { Kanban } from '@heroui-pro/react';
import * as React from 'react';
import { type DropItem, isTextDropItem, useDragAndDrop } from 'react-aria-components';
import {
    IssueAssigneeMark,
    IssueDueDate,
    IssueLabelChips,
    IssueSubProgress,
} from './issue-facts.tsx';
import { IssuePriorityMark, IssueStateDisc } from './issue-glyphs.tsx';
import { issueStateLabels, issueStateRef } from './issue-state.ts';
import { issueBoardColumns, type IssueStateGroup } from './issues-page-model.ts';
import { useIssuePatch } from './use-issue-patch.ts';
import { useOpenIssue } from './use-open-issue.ts';

const issueDragType = 'application/x-haus-issue-id';

export function IssueBoard({ issues }: { issues: readonly Issue[] }) {
    const patch = useIssuePatch();
    const [moving, setMoving] = React.useState<ReadonlyMap<string, IssueState>>(() => new Map());
    const shown = React.useMemo(() => withMoves(issues, moving), [issues, moving]);
    const move = (issueId: string, state: IssueState) => {
        const issue = issues.find((candidate) => candidate.id === issueId);
        if (!issue || (moving.get(issueId) ?? issue.state.id) === state) {
            return;
        }
        setMoving((current) => new Map(current).set(issueId, state));
        patch(
            issue,
            { state },
            {
                onSettled: () =>
                    setMoving((current) => {
                        const next = new Map(current);
                        next.delete(issueId);
                        return next;
                    }),
            }
        );
    };
    return (
        <Kanban className="issue-board" size="sm">
            {issueBoardColumns(shown).map((column) => (
                <IssueBoardColumn column={column} key={column.state} onMove={move} />
            ))}
        </Kanban>
    );
}

function IssueBoardColumn({
    column,
    onMove,
}: {
    column: IssueStateGroup;
    onMove: (issueId: string, state: IssueState) => void;
}) {
    const openIssue = useOpenIssue();
    const label = issueStateLabels[column.state];
    const drop = async (items: readonly DropItem[]) => {
        for (const id of await droppedIssueIds(items)) {
            onMove(id, column.state);
        }
    };
    const { dragAndDropHooks } = useDragAndDrop({
        acceptedDragTypes: [issueDragType],
        getDropOperation: () => 'move',
        getItems: (keys) => [...keys].map((key) => ({ [issueDragType]: String(key) })),
        onInsert: (event) => drop(event.items),
        onRootDrop: (event) => drop(event.items),
    });
    return (
        <Kanban.Column>
            <Kanban.ColumnHeader>
                <Kanban.ColumnIndicator>
                    <IssueStateDisc state={column.state} />
                </Kanban.ColumnIndicator>
                <Kanban.ColumnTitle>{label}</Kanban.ColumnTitle>
                <Kanban.ColumnCount>{column.issues.length}</Kanban.ColumnCount>
            </Kanban.ColumnHeader>
            <Kanban.ColumnBody>
                <Kanban.CardList
                    aria-label={`${label} issues`}
                    dragAndDropHooks={dragAndDropHooks}
                    items={column.issues}
                    onAction={(key) => {
                        const issue = column.issues.find((candidate) => candidate.id === key);
                        if (issue) {
                            openIssue(issue);
                        }
                    }}
                    renderEmptyState={() => <span className="text-muted text-sm">No issues</span>}
                >
                    {(issue) => <IssueCard issue={issue} />}
                </Kanban.CardList>
            </Kanban.ColumnBody>
        </Kanban.Column>
    );
}

function IssueCard({ issue }: { issue: Issue }) {
    return (
        <Kanban.Card id={issue.id} textValue={`${issue.code} ${issue.title}`}>
            <Kanban.DragHandle aria-label={`Move ${issue.code}`} />
            <span className="flex items-center justify-between gap-2">
                <span className="text-muted text-xs tabular-nums">{issue.code}</span>
                <IssuePriorityMark priority={issue.priority} />
            </span>
            <span className="leading-snug">{issue.title}</span>
            <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                    <IssueSubProgress issue={issue} />
                    <IssueDueDate issue={issue} />
                    <IssueLabelChips labelIds={issue.labelIds} />
                </span>
                <IssueAssigneeMark assignee={issue.assignee} />
            </span>
        </Kanban.Card>
    );
}

async function droppedIssueIds(items: readonly DropItem[]) {
    const texts = items.filter(isTextDropItem).filter((item) => item.types.has(issueDragType));
    return await Promise.all(texts.map((item) => item.getText(issueDragType)));
}

function withMoves(issues: readonly Issue[], moving: ReadonlyMap<string, IssueState>) {
    return issues.map((issue) => {
        const state = moving.get(issue.id);
        return state ? { ...issue, state: issueStateRef(state) } : issue;
    });
}
