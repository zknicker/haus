import type { IssueActor } from '@haus/api';
import { Message01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useIssue } from '../../../hooks/issues/use-issue.ts';
import { useAgentAppearances } from '../../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useTask } from '../../../hooks/tasks/use-task.ts';
import { hausTrpc, type ServerDetail } from '../../../lib/haus-server.tsx';
import { ChatMarkdownText } from '../../chats/chat-markdown-text.tsx';
import { taskRoute } from '../../servers/server-routes.ts';
import { taskAge } from '../../tasks/tasks-page-model.ts';
import {
    CaptainListEmpty,
    CaptainListGroup,
    CaptainListRow,
    CaptainListRows,
    useCaptainListCollapse,
} from '../captain-list.tsx';
import { issueStateLabels } from './captain-model.ts';
import { IssueStateGlyph } from './issue-state-glyph.tsx';
import { PanelDrillHeader } from './panel-drill-header.tsx';

export function IssueDrillIn({
    backLabel,
    issueId,
    onBack,
    server,
}: {
    backLabel: string;
    issueId: string;
    onBack: () => void;
    server: ServerDetail;
}) {
    const detail = useIssue(server.id, issueId);
    const issue = detail.data?.issue;
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <PanelDrillHeader backLabel={backLabel} onBack={onBack}>
                <span className="text-muted font-normal tabular-nums">{issue?.code}</span>
            </PanelDrillHeader>
            {issue ? (
                <h3 className="text-foreground px-2.5 text-lg font-semibold">{issue.title}</h3>
            ) : null}
            {detail.error ? <CaptainListEmpty>{detail.error.message}</CaptainListEmpty> : null}
            {issue ? (
                <>
                    <dl className="issue-facts">
                        <dt>Status</dt>
                        <dd>
                            <IssueStateGlyph state={issue.state.id} />
                            {issueStateLabels[issue.state.id]}
                        </dd>
                        <dt>Assignee</dt>
                        <dd>
                            {issue.assignee ? (
                                <IssueActorName actor={issue.assignee} serverId={server.id} />
                            ) : (
                                <span className="text-muted">No one</span>
                            )}
                        </dd>
                    </dl>
                    {issue.description.trim() ? (
                        <div className="px-2.5 text-sm">
                            <ChatMarkdownText content={issue.description} />
                        </div>
                    ) : null}
                    {issue.taskIds.length > 0 ? (
                        <div className="mt-2">
                            <LinkedTasks server={server} taskIds={issue.taskIds} />
                        </div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

function IssueActorName({ actor, serverId }: { actor: IssueActor; serverId: string }) {
    const humans = useHumanDirectory(serverId);
    const agents = useAgentAppearances(serverId);
    const task = useTask(serverId, actor.kind === 'task' ? { taskId: actor.taskId } : undefined);
    if (actor.kind === 'task') {
        return <span>{task.data?.title ?? 'A Task'}</span>;
    }
    const face =
        actor.kind === 'user'
            ? { name: humans.name(actor.userId), src: humans.avatarUrl(actor.userId) }
            : (() => {
                  const agent = agents.find((candidate) => candidate.id === actor.agentId);
                  return {
                      name: agent?.displayName ?? 'Removed Captain',
                      src: agent?.avatarUrl ?? null,
                  };
              })();
    return (
        <>
            <EntityAvatar name={face.name} size={16} src={face.src} />
            {face.name}
        </>
    );
}

function LinkedTasks({ server, taskIds }: { server: ServerDetail; taskIds: readonly string[] }) {
    const navigate = useNavigate();
    const utils = hausTrpc.useUtils();
    const collapse = useCaptainListCollapse();
    return (
        <CaptainListGroup collapse={collapse} count={taskIds.length} title="Tasks">
            <CaptainListRows
                label="Tasks"
                onAction={(taskId) => {
                    const key = utils.task.get.getData({ serverId: server.id, taskId })?.shortId;
                    if (key) {
                        navigate(taskRoute(server.slug, key));
                    }
                }}
            >
                {taskIds.map((taskId) => (
                    <LinkedTaskRow key={taskId} serverId={server.id} taskId={taskId} />
                ))}
            </CaptainListRows>
        </CaptainListGroup>
    );
}

function LinkedTaskRow({ serverId, taskId }: { serverId: string; taskId: string }) {
    const now = useRelativeNow(60_000);
    const task = useTask(serverId, { taskId }).data;
    return (
        <CaptainListRow
            age={task ? taskAge(task, now) : null}
            glyph={<Icon aria-hidden="true" icon={Message01Icon} size={14} />}
            id={taskId}
            textValue={task?.title ?? 'Task'}
            title={task?.title ?? ' '}
        />
    );
}
