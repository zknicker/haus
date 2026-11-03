import { Alert, Button, CloseButton, Tooltip } from '@heroui/react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useServerContext } from '../servers/server-context.ts';
import { serverComputersRoute } from '../servers/server-routes.ts';
import {
    computerDiskWarning,
    computerDiskWarningDescription,
    shouldShowDiskNotice,
} from './computer-disk.ts';
import { computerLabel } from './presentation.ts';

/** The person who attached a Computer owns its host disk warning. */
export function ComputerDiskNotices() {
    const { server } = useServerContext();
    const canOperate = server.role === 'owner' || server.role === 'admin';
    const computers = useComputers(server.id, { enabled: canOperate });
    if (!canOperate) {
        return null;
    }
    return (
        <>
            {computers.data
                ?.filter((computer) => computer.attachedByCurrentUser)
                .map((computer) => {
                    const warning = computerDiskWarning(computer);
                    return warning ? (
                        <ComputerDiskNotice
                            destination={`${serverComputersRoute(server.slug)}?computer=${encodeURIComponent(computer.id)}`}
                            key={computer.id}
                            name={computerLabel(computer)}
                            storageKey={`haus:disk-warning:${server.id}:${computer.id}`}
                            warning={warning}
                        />
                    ) : null;
                })}
        </>
    );
}

function ComputerDiskNotice({
    name,
    storageKey,
    warning,
    destination,
}: {
    name: string;
    storageKey: string;
    warning: NonNullable<ReturnType<typeof computerDiskWarning>>;
    destination: string;
}) {
    const navigate = useNavigate();
    const [dismissed, setDismissed] = React.useState(() => readDismissal(storageKey));
    if (!shouldShowDiskNotice(warning.severity, dismissed)) {
        return null;
    }
    const dismiss = () => {
        setDismissed(warning.severity);
        try {
            localStorage.setItem(storageKey, warning.severity);
        } catch {
            /* This window still remembers the dismissal when storage is unavailable. */
        }
    };
    return (
        <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>{name} is low on disk space</Alert.Title>
                <Alert.Description>
                    {warning.label}. {computerDiskWarningDescription}
                </Alert.Description>
                <Button onPress={() => navigate(destination)} size="sm" variant="tertiary">
                    View Computer
                </Button>
            </Alert.Content>
            <Tooltip>
                <CloseButton aria-label={`Dismiss disk warning for ${name}`} onPress={dismiss} />
                <Tooltip.Content>Dismiss</Tooltip.Content>
            </Tooltip>
        </Alert>
    );
}

function readDismissal(key: string) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}
