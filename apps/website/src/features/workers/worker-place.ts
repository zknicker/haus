import type { Worker, WorkerPlaceView } from '@haus/api';
import { cloudAgentProviderName } from './cloud-agent-provider-presentation.ts';

export function workerPlaceName(work: Pick<Worker, 'place'>) {
    return work.place.kind === 'computer'
        ? (work.place.computerName ?? 'Device')
        : cloudAgentProviderName(work.place.kind);
}

export function workerPlaceProvider(place: WorkerPlaceView) {
    return place.kind === 'computer' ? null : place.kind;
}
