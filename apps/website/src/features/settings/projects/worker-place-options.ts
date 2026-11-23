import {
    type CloudAgentProvider,
    cloudAgentProviders,
    formatWorkerPlace,
    parseWorkerPlace,
    type WorkerPlace,
    type WorkerPlaceView,
} from '@haus/api';
import { cloudAgentProviderName } from '../../workers/cloud-agent-provider-presentation.ts';

export const noDefaultPlaceKey = 'none';

export interface WorkerPlaceOption {
    id: string;
    label: string;
}

export interface WorkerPlaceDevice {
    id: string;
    label: string;
    workersEnabled: boolean;
}

export function workerPlaceOptions(
    current: WorkerPlaceView | null,
    devices: readonly WorkerPlaceDevice[]
) {
    const options: WorkerPlaceOption[] = [
        { id: noDefaultPlaceKey, label: noDefaultLabel },
        ...cloudAgentProviders.map((provider) => ({
            id: provider,
            label: cloudPlaceLabel(provider),
        })),
        ...devices
            .filter((device) => device.workersEnabled)
            .map((device) => ({
                id: formatWorkerPlace({ computerId: device.id, kind: 'computer' }),
                label: device.label,
            })),
    ];
    const currentKey = workerPlaceKey(current);
    return options.some((option) => option.id === currentKey)
        ? options
        : [...options, { id: currentKey, label: workerPlaceLabel(current) }];
}

export function workerPlaceKey(place: WorkerPlaceView | null) {
    return place ? formatWorkerPlace(place) : noDefaultPlaceKey;
}

export function workerPlaceFromKey(key: string) {
    const place: WorkerPlace | null | undefined =
        key === noDefaultPlaceKey ? null : (parseWorkerPlace(key) ?? undefined);
    return place;
}

export function workerPlaceLabel(place: WorkerPlaceView | null) {
    if (!place) {
        return noDefaultLabel;
    }
    return place.kind === 'computer'
        ? (place.computerName ?? 'Device')
        : cloudPlaceLabel(place.kind);
}

const noDefaultLabel = 'No default';

function cloudPlaceLabel(provider: CloudAgentProvider) {
    return `${cloudAgentProviderName(provider)} Cloud`;
}
