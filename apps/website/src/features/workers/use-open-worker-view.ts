import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { tabIntentState } from '../../hooks/desktop-tabs/tab-navigation.ts';
import { currentOpenGesture } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { workerRoute } from '../servers/server-routes.ts';
import { WorkerOpenContext } from './worker-open-context.tsx';

export function useOpenWorkerView() {
    const inPane = React.use(WorkerOpenContext);
    const navigate = useNavigate();
    const { slug = '' } = useParams();
    return (
        inPane ??
        ((workerId: string) =>
            navigate(workerRoute(slug, workerId), { state: tabIntentState(currentOpenGesture()) }))
    );
}
