import type { Worker } from '@haus/api';
import { cloudAgentProviderName } from './cloud-agent-provider-presentation.ts';

export function workerPlaceName(work: Pick<Worker, 'place'>) {
    return cloudAgentProviderName(work.place);
}
