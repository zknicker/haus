import type { Worker } from '@haus/api';
import { Link } from '@heroui/react';
import {
    canOpenCloudAgentProvider,
    cloudAgentProviderName,
    openCloudAgentProvider,
    openInCloudAgentProviderLabel,
} from './cloud-agent-provider-presentation.ts';

export function WorkerPlace({
    work,
}: {
    work: Pick<Worker, 'place' | 'providerAgentId' | 'providerUrl'>;
}) {
    const target = { ...work, provider: work.place };
    const name = cloudAgentProviderName(work.place);
    if (!canOpenCloudAgentProvider(target)) {
        return <span>{name}</span>;
    }
    return (
        <Link
            aria-label={openInCloudAgentProviderLabel(work.place)}
            onPress={() => openCloudAgentProvider(target)}
        >
            {name}
            <Link.Icon />
        </Link>
    );
}

export function workerPlaceName(work: Pick<Worker, 'place'>) {
    return cloudAgentProviderName(work.place);
}
