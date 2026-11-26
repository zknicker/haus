import { useNavigate } from 'react-router-dom';
import { useCreateTask } from '../../hooks/tasks/use-create-task.ts';
import { taskRoute } from '../servers/server-routes.ts';
import { type HomeAsk, planHomeTask } from './home-send.ts';

export function useHomeSend(serverId: string, slug: string) {
    const navigate = useNavigate();
    const create = useCreateTask();
    const send = (ask: HomeAsk, onCreated: () => void) => {
        const input = planHomeTask(ask);
        if (!input) {
            return;
        }
        create.mutate(
            { ...input, serverId },
            {
                onSuccess: ({ task }) => {
                    onCreated();
                    navigate(taskRoute(slug, task.shortId));
                },
            }
        );
    };
    return { error: create.error?.message ?? null, isPending: create.isPending, send };
}
