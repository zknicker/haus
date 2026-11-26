import type { Agent } from '@haus/api';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { captainTaskFilters } from '../../../hooks/members/use-agent-hub-reveal.ts';
import { useProjects } from '../../../hooks/projects/use-projects.ts';
import { useTaskList } from '../../../hooks/tasks/use-task-list.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { taskRoute } from '../../servers/server-routes.ts';
import { taskPriorityLabels } from '../../tasks/task-presentation.ts';
import { TaskStateDisc } from '../../tasks/task-state-disc.tsx';
import { taskStateLabels } from '../../tasks/task-state.ts';
import { taskAge } from '../../tasks/tasks-page-model.ts';
import { CaptainListGroup, CaptainListRow, CaptainListRows } from './captain-list.tsx';

export function AgentWorkingOn({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const navigate = useNavigate();
    const now = useRelativeNow(60_000);
    const tasks = useTaskList(server.id, captainTaskFilters(agent.id)).data;
    const projects = useProjects(server.id).data;
    if (!tasks || tasks.length === 0) {
        return null;
    }
    const projectPlace = (projectId: string) => {
        const project = projects?.find((candidate) => candidate.chatId === projectId);
        return project ? `#${project.name}` : null;
    };

    return (
        <CaptainListGroup count={tasks.length} title="Working on">
            <CaptainListRows
                label="Working on"
                onAction={(id) => {
                    const task = tasks.find((candidate) => candidate.id === id);
                    if (task) {
                        navigate(taskRoute(server.slug, task.key));
                    }
                }}
            >
                {tasks.map((task) => (
                    <CaptainListRow
                        age={taskAge(task, now)}
                        glyph={
                            <span aria-label={taskStateLabels[task.state]} role="img">
                                <TaskStateDisc state={task.state} />
                            </span>
                        }
                        id={task.id}
                        key={task.id}
                        lead={task.key}
                        place={projectPlace(task.projectId)}
                        status={task.priority === 'none' ? null : taskPriorityLabels[task.priority]}
                        textValue={`${task.key} ${task.title}`}
                        title={task.title}
                    />
                ))}
            </CaptainListRows>
        </CaptainListGroup>
    );
}
