import { useWorkerRecord } from '../../../hooks/servers/use-worker.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { WorkerBandMenu } from '../view/worker-band-menu.tsx';
import { WorkerSession } from './worker-session.tsx';

export function WorkerPane({ workerId }: { workerId: string }) {
    const { server } = useServerContext();
    const work = useWorkerRecord(server.id, workerId).data;
    return work ? <WorkerSession work={work} /> : null;
}

export function WorkerPaneMenu({ workerId }: { workerId: string }) {
    const { server } = useServerContext();
    const work = useWorkerRecord(server.id, workerId).data;
    return work ? <WorkerBandMenu work={work} /> : null;
}
