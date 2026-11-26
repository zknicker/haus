import { useNavigate } from 'react-router-dom';
import { useStartTask } from '../../hooks/tasks/use-start-task.ts';
import { taskRoute } from '../servers/server-routes.ts';
import { type HomeAsk, planHomeTask } from './home-send.ts';

export function useHomeSend(slug: string) {
    const navigate = useNavigate();
    const start = useStartTask();
    const send = (ask: HomeAsk, onStarted: () => void) => {
        const input = planHomeTask(ask);
        if (!input) {
            return;
        }
        start.mutate(input, {
            onSuccess: ({ task }) => {
                onStarted();
                navigate(taskRoute(slug, task.shortId));
            },
        });
    };
    return { error: start.error?.message ?? null, isPending: start.isPending, send };
}
