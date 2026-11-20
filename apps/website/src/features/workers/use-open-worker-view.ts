import { useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { workerRoute } from '../servers/server-routes.ts';

export function useOpenWorkerView() {
    const navigate = useNavigate();
    const { slug = '' } = useParams();
    const route = useRef({ navigate, slug });
    route.current = { navigate, slug };
    return useCallback((workerId: string) => {
        route.current.navigate(workerRoute(route.current.slug, workerId));
    }, []);
}
