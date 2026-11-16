import type { Task } from '@haus/api';
import { useNavigate } from 'react-router-dom';
import { useServerContext } from '../servers/server-context.ts';
import { taskRoute } from '../servers/server-routes.ts';

/** Opening a Task is a push, so a desktop tab places it like any other link. */
export function useOpenTask() {
    const { server } = useServerContext();
    const navigate = useNavigate();
    return (task: Pick<Task, 'key' | 'number'>) => {
        const boardKey = task.key.slice(0, task.key.lastIndexOf('-'));
        navigate(taskRoute(server.slug, boardKey, task.number));
    };
}
