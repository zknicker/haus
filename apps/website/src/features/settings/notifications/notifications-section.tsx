import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Separator, Switch } from '@heroui/react';
import * as React from 'react';
import {
    enableMessageNotifications,
    type NotificationPermissionState,
    notificationPermission,
    setMessageNotificationsPreference,
    useMessageNotificationsPreference,
} from '../../notifications/message-notifications-preference.ts';
import { sendTestNotification } from '../../notifications/test-notification.ts';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';
import { SettingsRowError, SettingsRowWarning } from '../layout/settings-text.tsx';

export function NotificationsSection() {
    const preference = useMessageNotificationsPreference();
    const [permission, setPermission] =
        React.useState<NotificationPermissionState>(notificationPermission);
    const [isRequesting, setIsRequesting] = React.useState(false);
    const isOn = preference && permission === 'granted';
    const blocked = blockedReason(permission);

    const onChange = (next: boolean) => {
        if (!next) {
            setMessageNotificationsPreference(false);
            return;
        }
        setIsRequesting(true);
        enableMessageNotifications()
            .then(setPermission)
            .finally(() => setIsRequesting(false));
    };

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>System notifications</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                <ItemCard>
                    <ItemCard.Content>
                        <SettingsRowTitle info="DMs, @mentions, and replies while Haus is in the background.">
                            Notify me when I'm needed
                        </SettingsRowTitle>
                        <SettingsRowWarning>{blocked}</SettingsRowWarning>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Switch
                            aria-label="Notify me when I'm needed"
                            isDisabled={isRequesting || blocked !== null}
                            isSelected={isOn}
                            onChange={onChange}
                        >
                            <Switch.Content>
                                <Switch.Control>
                                    <Switch.Thumb />
                                </Switch.Control>
                            </Switch.Content>
                        </Switch>
                    </ItemCard.Action>
                </ItemCard>
                <Separator />
                <TestNotificationRow isOn={isOn} />
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

export function TestNotificationRow({ isOn }: { isOn: boolean }) {
    const [error, setError] = React.useState<string | null>(null);

    const send = () => {
        try {
            const result = sendTestNotification();
            setError(result === 'sent' ? null : testFailure[result]);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The notification did not show.');
        }
    };

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Test notification</ItemCard.Title>
                <SettingsRowError>{error}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                <Button isDisabled={!isOn} onPress={send} size="sm" variant="secondary">
                    Send
                </Button>
            </ItemCard.Action>
        </ItemCard>
    );
}

const testFailure = {
    blocked: 'Notifications are blocked for Haus. Allow them in your system or browser settings.',
    unsupported: 'This browser cannot show notifications.',
};

function blockedReason(permission: NotificationPermissionState) {
    if (permission === 'unsupported') {
        return testFailure.unsupported;
    }
    if (permission === 'denied') {
        return testFailure.blocked;
    }
    return null;
}
