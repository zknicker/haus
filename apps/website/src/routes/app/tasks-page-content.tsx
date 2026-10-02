import { TaskContent } from '../../features/servers/tasks/task-content.tsx';
import { TaskThreadDialog } from '../../features/servers/tasks/task-thread-dialog.tsx';
import { useTaskView } from '../../features/servers/tasks/task-view.ts';

export function TasksPageContent() {
    const { openTask } = useTaskView();
    return (
        <>
            <TaskContent onOpenTask={(task) => openTask(task.id)} />
            <TaskThreadDialog />
        </>
    );
}
