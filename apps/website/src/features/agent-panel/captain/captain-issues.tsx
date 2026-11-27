import type { Issue, IssueState } from '@haus/api';
import * as React from 'react';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useIssueList } from '../../../hooks/issues/use-issue-list.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { taskAge } from '../../tasks/tasks-page-model.ts';
import {
    CaptainListEmpty,
    CaptainListGroup,
    CaptainListRow,
    CaptainListRows,
} from '../captain-list.tsx';
import { issueGroupStartsOpen, issueGroups, issueStateLabels } from './captain-model.ts';
import { IssueStateGlyph } from './issue-state-glyph.tsx';

export function CaptainIssues({
    agentId,
    onOpenIssue,
    server,
}: {
    agentId: string;
    onOpenIssue: (issueId: string) => void;
    server: ServerDetail;
}) {
    const now = useRelativeNow(60_000);
    const issues = useIssueList(server.id, { assignee: { agentId, kind: 'captain' } });
    const [flipped, setFlipped] = React.useState<ReadonlySet<IssueState>>(new Set());
    if (issues.error) {
        return <CaptainListEmpty>{issues.error.message}</CaptainListEmpty>;
    }
    if (!issues.data) {
        return null;
    }
    const groups = issueGroups(issues.data);
    if (groups.length === 0) {
        return <CaptainListEmpty>No Issues assigned.</CaptainListEmpty>;
    }
    const toggle = (state: IssueState) =>
        setFlipped((previous) => {
            const next = new Set(previous);
            if (next.has(state)) {
                next.delete(state);
            } else {
                next.add(state);
            }
            return next;
        });

    return (
        <div className="flex min-w-0 flex-col gap-3">
            {groups.map((group) => {
                const open = issueGroupStartsOpen(group.state) !== flipped.has(group.state);
                return (
                    <CaptainListGroup
                        collapse={{ onToggle: () => toggle(group.state), open }}
                        count={group.issues.length}
                        key={group.state}
                        title={issueStateLabels[group.state]}
                    >
                        <CaptainListRows
                            label={issueStateLabels[group.state]}
                            onAction={onOpenIssue}
                        >
                            {group.issues.map((issue) => (
                                <IssueRow issue={issue} key={issue.id} now={now} />
                            ))}
                        </CaptainListRows>
                    </CaptainListGroup>
                );
            })}
        </div>
    );
}

function IssueRow({ issue, now }: { issue: Issue; now: number }) {
    return (
        <CaptainListRow
            age={taskAge({ createdAt: issue.updatedAt }, now)}
            glyph={<IssueStateGlyph state={issue.state.id} />}
            id={issue.id}
            lead={issue.code}
            note={
                issue.taskIds.length > 0
                    ? `${issue.taskIds.length} ${issue.taskIds.length === 1 ? 'task' : 'tasks'}`
                    : null
            }
            textValue={`${issue.code} ${issue.title}`}
            title={issue.title}
        />
    );
}
