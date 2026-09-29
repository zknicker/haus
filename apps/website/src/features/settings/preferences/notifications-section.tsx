import { Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import * as React from 'react';
import {
    enableNeedsYouNotifications,
    type NotificationPermissionState,
    notificationPermission,
    setNeedsYouNotificationsPreference,
    useNeedsYouNotificationsPreference,
} from '../../notifications/needs-you-notifications-preference.ts';

/**
 * The one place Haus asks for notification permission. Turning the switch on
 * requests it; the switch reads on only once the platform granted it.
 */
export function NotificationsSection() {
    const preference = useNeedsYouNotificationsPreference();
    const [permission, setPermission] =
        React.useState<NotificationPermissionState>(notificationPermission);
    const [isRequesting, setIsRequesting] = React.useState(false);
    const isOn = preference && permission === 'granted';
    const blocked = blockedReason(permission);

    const onChange = (next: boolean) => {
        if (!next) {
            setNeedsYouNotificationsPreference(false);
            return;
        }
        setIsRequesting(true);
        enableNeedsYouNotifications()
            .then(setPermission)
            .finally(() => setIsRequesting(false));
    };

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Notifications</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Notify me when I'm needed</ItemCard.Title>
                        <ItemCard.Description>
                            {blocked ?? 'DMs and @mentions while Haus is in the background.'}
                        </ItemCard.Description>
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
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function blockedReason(permission: NotificationPermissionState): null | string {
    if (permission === 'unsupported') {
        return 'This browser cannot show notifications.';
    }
    if (permission === 'denied') {
        return 'Notifications are blocked for Haus. Allow them in your system or browser settings.';
    }
    return null;
}
