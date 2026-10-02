import type { Agent, Chat, MessageTask } from '@haus/api';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { EntityName } from '../../../components/ui/entity-name.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useTaskUpdate } from '../../../hooks/servers/use-task-update.ts';
import { useTasks } from '../../../hooks/servers/use-tasks.ts';
import type { HumanDirectory } from '../human-identity.ts';
import { TaskAssignee } from './task-assignee.tsx';
import { taskUpdateInput } from './task-input.ts';
import { taskAssigneeAvatarUrl, taskAssigneeName } from './task-model.ts';
import { TaskStatusSelect } from './task-status-select.tsx';

export function TaskThreadMetadata({
    chat,
    chatId,
    fallbackTask,
    messageId,
    serverId,
}: {
    /** The parent chat, shown as a field so its role is explicit. */
    chat?: Chat;
    chatId: string;
    fallbackTask: MessageTask;
    messageId: string;
    serverId: string;
}) {
    const agents = useAgents(serverId);
    const humans = useHumanDirectory(serverId);
    const tasks = useTasks(serverId, chatId);
    const update = useTaskUpdate();
    const task =
        tasks.data?.tasks.find((item) => item.task.messageId === messageId)?.task ?? fallbackTask;
    const agentDirectory = agents.data ?? [];
    const assigneeLabel = taskAssigneeName(task, agentDirectory);
    const creator = taskCreatorIdentity(task, agentDirectory, humans);
    const target = {
        assigneeAgentId: task.assigneeAgentId,
        assigneeAvatarUrl: taskAssigneeAvatarUrl(task, agentDirectory),
        assigneeLabel,
        id: messageId,
        number: task.number,
        status: task.status,
        version: task.version,
    };

    return (
        // An outlined group, not a filled one: the composer below already owns
        // the modal's one filled surface, and two slabs at nearly the same
        // value read as two input areas rather than as information + input.
        // The controls are inline for the same reason — boxed fields beside
        // plain facts split the row into two visual kinds at equal width.
        <section
            aria-label={`Task #${task.number} details`}
            className="card-shell mb-4 border border-border px-4 py-3"
        >
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <dt className="text-muted text-sm">Status</dt>
                    <dd className="flex min-h-7 min-w-0 flex-col justify-center gap-1">
                        <TaskStatusSelect
                            error={update.error}
                            isDisabled={update.isPending}
                            onStatusChange={(status) =>
                                update.mutate(taskUpdateInput(serverId, target, { status }))
                            }
                            presentation="inline"
                            task={target}
                        />
                    </dd>
                </div>
                <div className="flex min-w-0 max-w-52 flex-col gap-1.5">
                    <dt className="text-muted text-sm">Assignee</dt>
                    <dd className="flex min-h-7 min-w-0 items-center">
                        <TaskAssignee presentation="inline" serverId={serverId} task={target} />
                    </dd>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                    <dt className="text-muted text-sm">Created by</dt>
                    <dd className="flex min-h-7 min-w-0 items-center text-sm">
                        <EntityName avatarUrl={creator.avatarUrl} name={creator.name} />
                    </dd>
                </div>
                {chat ? (
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <dt className="text-muted text-sm">Chat</dt>
                        <dd className="flex min-h-7 min-w-0 items-center gap-2 text-sm">
                            <ChatIdentity agents={agentDirectory} chat={chat} />
                        </dd>
                    </div>
                ) : null}
            </dl>
        </section>
    );
}

/**
 * The parent chat, wearing the same mark it wears in the sidebar. Channel
 * colour rides ChannelIconBox's own tokens, so a channel picks one up here the
 * moment the Chat record starts carrying one.
 */
function ChatIdentity({ agents, chat }: { agents: Agent[]; chat: Chat }) {
    if (chat.kind === 'channel') {
        return (
            <>
                <ChannelIconBox size="inline" />
                <span className="min-w-0 truncate">{chat.name ?? 'channel'}</span>
            </>
        );
    }

    const peer = agents.find((agent) => agent.id === chat.peerAgentId);
    return (
        <EntityName
            avatarUrl={peer?.avatarUrl ?? null}
            name={peer?.displayName ?? chat.peerAgentDisplayName ?? 'Direct message'}
            size={18}
        />
    );
}

function taskCreatorIdentity(
    task: Pick<MessageTask, 'createdByAgentId' | 'createdByUserId'>,
    agents: Agent[],
    humans: HumanDirectory
) {
    if (task.createdByAgentId) {
        const agent = agents.find((candidate) => candidate.id === task.createdByAgentId);
        return {
            avatarUrl: agent?.avatarUrl ?? null,
            name: agent?.displayName ?? `Agent ${task.createdByAgentId.slice(-6)}`,
        };
    }
    if (task.createdByUserId) {
        return {
            avatarUrl: humans.avatarUrl(task.createdByUserId),
            name: humans.name(task.createdByUserId),
        };
    }
    return { avatarUrl: null, name: 'Unknown' };
}
