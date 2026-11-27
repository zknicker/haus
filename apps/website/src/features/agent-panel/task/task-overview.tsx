import type { TaskDetail } from '@haus/api';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { PullRequestRows } from '../../tasks/work/pull-request-rows.tsx';
import { CaptainListGroup, useCaptainListCollapse } from '../captain-list.tsx';
import { TaskArchiveAction } from './task-archive-action.tsx';
import { TaskFacts } from './task-facts.tsx';
import { TaskLinkedIssues } from './task-linked-issues.tsx';

export function TaskOverview({ server, task }: { server: ServerDetail; task: TaskDetail }) {
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <TaskLinkedIssues server={server} taskId={task.id} />
            <TaskPullRequests task={task} />
            <TaskFacts server={server} task={task} />
            <TaskArchiveAction task={task} />
        </div>
    );
}

function TaskPullRequests({ task }: { task: Pick<TaskDetail, 'pullRequests'> }) {
    const collapse = useCaptainListCollapse();
    if (task.pullRequests.length === 0) {
        return null;
    }
    return (
        <CaptainListGroup
            collapse={collapse}
            count={task.pullRequests.length}
            title="Pull requests"
        >
            <PullRequestRows readings={task.pullRequests} />
        </CaptainListGroup>
    );
}
