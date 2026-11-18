import { Alert } from '@heroui/react';
import { AlertCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';

/** The failure notice every channel dialog shows when its save is rejected. */
export function ChannelDialogError({ message }: { message: string | null }) {
    return message ? (
        <Alert status="danger">
            <Alert.Indicator>
                <Icon icon={AlertCircleIcon} />
            </Alert.Indicator>
            <Alert.Content>
                <Alert.Description>{message}</Alert.Description>
            </Alert.Content>
        </Alert>
    ) : null;
}
