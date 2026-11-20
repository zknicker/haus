import { useNavigate, useParams } from 'react-router-dom';
import { tabIntentState } from '../../hooks/desktop-tabs/tab-navigation.ts';
import { currentOpenGesture } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { workerRoute } from '../servers/server-routes.ts';

export function useOpenWorkerView() {
    const navigate = useNavigate();
    const { slug = '' } = useParams();
    return (workerId: string) =>
        navigate(workerRoute(slug, workerId), { state: tabIntentState(currentOpenGesture()) });
}
