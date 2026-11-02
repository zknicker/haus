import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useTasks } from '../../../hooks/servers/use-tasks.ts';
import { useServerContext } from '../server-context.ts';
import { ThreadPeekDialog } from '../thread/thread-peek-dialog.tsx';
import { useTaskView } from './task-view.ts';
import { useTaskThread } from './use-task-thread.ts';

/**
 * The Task peek: opening a task from the Board or List lenses shows its
 * Thread work surface over the tasks page. `?task=<messageId>` owns the open
 * task, so deep links and Back work. A task on a message inside a Thread
 * opens the Thread it sits in, under its parent Channel or DM.
 */
export function TaskThreadDialog() {
    const { server } = useServerContext();
    const { closeTask, openTaskId } = useTaskView();
    // The peek addresses one task by id, so it reads past the Board's lens: a
    // background-tier task the Board hides still opens from `?task=`.
    const tasks = useTasks(server.id, undefined, {
        enabled: openTaskId !== null,
        includeBackground: true,
    });
    const chats = useChats(server.id);
    const item = openTaskId
        ? tasks.data?.tasks.find((candidate) => candidate.task.messageId === openTaskId)
        : undefined;
    // `task.chatId` is always the top-level Channel or DM, a Thread task's included.
    const chat = item
        ? chats.data?.find((candidate) => candidate.id === item.task.chatId)
        : undefined;
    const thread = useTaskThread(server.id, item);

    if (!(item && chat && thread)) {
        return null;
    }

    return (
        <ThreadPeekDialog
            anchor={thread.anchor}
            ariaLabel={`Task #${item.task.number} thread`}
            chat={chat}
            headerTitle={`Task #${item.task.number}`}
            initialThreadChatId={thread.threadChatId}
            onClose={closeTask}
            summary={thread.summary}
            taskMessage={thread.taskMessage}
        />
    );
}
