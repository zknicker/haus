import { Chip } from '@heroui/react';

type ConnectionState = 'error' | 'live' | 'needs-auth';
export type ConnectionTarget = 'secure-storage';

interface ProviderConnectionDescriptionProps {
    description: string;
    state: ConnectionState;
    target?: ConnectionTarget;
}

export function ProviderConnectionDescription({
    description,
    state,
    target,
}: ProviderConnectionDescriptionProps) {
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <ProviderConnectionStatus state={state} />
            <ProviderConnectionDetail description={description} state={state} target={target} />
        </div>
    );
}

export function ProviderConnectionStatus({ state }: { state: ConnectionState }) {
    return (
        <Chip color={getStatusColor(state)} size="sm" variant="soft">
            {getStatusLabel(state)}
        </Chip>
    );
}

export function ProviderConnectionDetail({
    description,
    state,
    target,
}: ProviderConnectionDescriptionProps) {
    if (state === 'live' && target) {
        return (
            <Chip size="sm" variant="soft">
                Secure storage
            </Chip>
        );
    }

    return description ? <span className="text-muted">{description}</span> : null;
}

function getStatusColor(state: ConnectionState) {
    switch (state) {
        case 'live':
            return 'success' as const;
        case 'error':
            return 'danger' as const;
        case 'needs-auth':
            return 'default' as const;
    }
}

function getStatusLabel(state: ConnectionState) {
    switch (state) {
        case 'live':
            return 'Connected';
        case 'error':
            return 'Error';
        case 'needs-auth':
            return 'Not connected';
    }
}
