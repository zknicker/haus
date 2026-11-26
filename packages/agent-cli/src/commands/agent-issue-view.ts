import { indentContinuationLines } from '@haus/agent-prompt';
import type {
    AgentIssueActivityRow,
    AgentIssueActor,
    AgentIssueCommentRow,
    AgentIssueRow,
    AgentIssueShowResponse,
} from '@haus/api';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { formatUtcTime } from '../agent-format.ts';
import { clip } from './agent-reminder-view.ts';

export interface IssueDeps {
    client: AgentApiRequester;
    readStdin(): Promise<string>;
    stdinIsTty: boolean;
    write(text: string): void;
}

export function describeIssue(issue: AgentIssueRow) {
    const facts = [
        `priority ${issue.priority}`,
        issue.assignee ? `assigned ${issueActorLabel(issue.assignee)}` : 'unassigned',
        ...(issue.dueOn ? [`due ${issue.dueOn}`] : []),
        ...(issue.labels.length > 0 ? [`labels ${issue.labels.join(', ')}`] : []),
        ...(issue.parent ? [`parent ${issue.parent}`] : []),
        ...(issue.subIssueCount > 0
            ? [`${issue.closedSubIssueCount}/${issue.subIssueCount} sub-issues closed`]
            : []),
    ];
    const title = issue.title.replaceAll(/\s+/gu, ' ').trim();
    return `${issue.code} [${issue.state}] "${title}" · ${facts.join(' · ')}`;
}

export function issueActorLabel(actor: AgentIssueActor) {
    if (actor.kind === 'task') {
        return actor.title ? `task:${actor.taskId} "${actor.title}"` : `task:${actor.taskId}`;
    }
    if (actor.handle) {
        return `@${actor.handle}`;
    }
    return actor.kind === 'captain' ? 'a Captain with no handle' : 'a person with no handle';
}

export function formatIssueDetail(detail: AgentIssueShowResponse) {
    const { activity, comments, description, issue, pullRequests, subIssues } = detail;
    const lines = [
        describeIssue(issue),
        `Created by ${issueActorLabel(issue.creator)} ${formatUtcTime(issue.createdAt)}; updated ${formatUtcTime(issue.updatedAt)}; version ${issue.version}`,
    ];
    if (issue.taskIds.length > 0) {
        lines.push(`Tasks: ${issue.taskIds.map((id) => `task:${id}`).join(', ')}`);
    }
    if (description) {
        lines.push('', 'Description:', indentContinuationLines(description));
    }
    if (subIssues.length > 0) {
        lines.push('', 'Sub-issues:', ...subIssues.map((sub) => `- ${describeIssue(sub)}`));
    }
    if (pullRequests.length > 0) {
        lines.push(
            '',
            'Pull requests:',
            ...pullRequests.map(
                (pull) => `- ${pull.repository}#${pull.number} ${pull.state ?? 'not read yet'}`
            )
        );
    }
    if (comments.length > 0) {
        lines.push('', 'Comments (oldest first):', ...comments.map(commentLine));
    }
    if (activity.length > 0) {
        lines.push('', 'Activity (newest last):', ...activity.map(activityLine));
    }
    return `${lines.join('\n')}\n`;
}

export function commentLine(comment: AgentIssueCommentRow) {
    const reply = comment.replyToCommentId ? ` reply-to=${comment.replyToCommentId}` : '';
    return `- [id=${comment.id}${reply} time=${formatUtcTime(comment.createdAt)}] ${issueActorLabel(comment.author)}: ${clip(comment.body)}`;
}

function activityLine(row: AgentIssueActivityRow) {
    const who = row.actor ? issueActorLabel(row.actor) : 'Haus';
    const values =
        row.from === null && row.to === null ? '' : `: ${row.from ?? 'none'} → ${row.to ?? 'none'}`;
    return `- ${formatUtcTime(row.createdAt)} ${who} ${row.kind.replaceAll('_', ' ')}${values}`;
}
