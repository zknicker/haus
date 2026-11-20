import type { Worker } from '@haus/api';
import { Link } from '@heroui/react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
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
        return <span className="shrink-0">{name}</span>;
    }
    const opensApp = getDesktopBridge() !== null && work.providerAgentId !== null;
    return (
        <Link
            aria-label={openInCloudAgentProviderLabel(work.place)}
            className="shrink-0"
            {...(opensApp || !work.providerUrl
                ? { onPress: () => openCloudAgentProvider(target) }
                : { href: work.providerUrl, rel: 'noreferrer', target: '_blank' })}
        >
            {name}
            <Link.Icon />
        </Link>
    );
}

export function workerPlaceName(work: Pick<Worker, 'place'>) {
    return cloudAgentProviderName(work.place);
}
