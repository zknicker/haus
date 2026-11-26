import type { TaskDetail } from '@haus/api';
import { DescriptionBody } from './task-description.tsx';

export function TaskHistoryDetails({ task }: { task: TaskDetail }) {
    return (
        <section aria-label="Details" className="task-details">
            {task.description ? (
                <div className="task-description-body">
                    <DescriptionBody task={task} />
                </div>
            ) : null}
        </section>
    );
}
