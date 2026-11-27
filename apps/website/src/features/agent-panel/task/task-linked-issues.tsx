import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useIssueList } from '../../../hooks/issues/use-issue-list.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { issueRoute } from '../../servers/server-routes.ts';
import {
    CaptainListGroup,
    CaptainListRow,
    CaptainListRows,
    useCaptainListCollapse,
} from '../captain-list.tsx';
import { issueStateLabels } from '../captain/captain-model.ts';
import { IssueStateGlyph } from '../captain/issue-state-glyph.tsx';

export function TaskLinkedIssues({ server, taskId }: { server: ServerDetail; taskId: string }) {
    const navigate = useNavigate();
    const issues = useIssueList(server.id, {}).data;
    const linked = React.useMemo(
        () => (issues ?? []).filter((issue) => issue.taskIds.includes(taskId)),
        [issues, taskId]
    );
    const collapse = useCaptainListCollapse();
    if (linked.length === 0) {
        return null;
    }
    return (
        <CaptainListGroup
            collapse={collapse}
            count={linked.length}
            title={linked.length === 1 ? 'Issue' : 'Issues'}
        >
            <CaptainListRows
                label="Linked issues"
                onAction={(id) => {
                    const issue = linked.find((candidate) => candidate.id === id);
                    if (issue) {
                        navigate(issueRoute(server.slug, issue.code));
                    }
                }}
            >
                {linked.map((issue) => (
                    <CaptainListRow
                        age={null}
                        glyph={<IssueStateGlyph state={issue.state.id} />}
                        id={issue.id}
                        key={issue.id}
                        lead={issue.code}
                        note={issueStateLabels[issue.state.id]}
                        textValue={`${issue.code} ${issue.title}`}
                        title={issue.title}
                    />
                ))}
            </CaptainListRows>
        </CaptainListGroup>
    );
}
