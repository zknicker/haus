import type { WorkerPlace } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { resolveRunModel } from './cloud-agent-model.ts';

export async function turnModel(
    tx: HausDatabase,
    serverId: string,
    worker: { carrierComputerId: string; model: string | null; place: WorkerPlace }
) {
    if (worker.place.kind === 'computer') {
        return { droppedParams: [], fallbackFrom: null, id: worker.model, params: [] };
    }
    return await resolveRunModel(tx, {
        computerId: worker.carrierComputerId,
        provider: worker.place.kind,
        serverId,
    });
}
