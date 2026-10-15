import { Alert, CloseButton } from '@heroui/react';
import { useLinearSetupOutcome } from '../../../../../hooks/linear/use-linear-setup-outcome.ts';
import { linearSetupNotice } from './linear-setup-notice-model.ts';

/** What Linear's install callback brought back, until the reader dismisses it. */
export function LinearSetupNotice() {
    const { dismiss, outcome } = useLinearSetupOutcome();
    if (!outcome) {
        return null;
    }
    const notice = linearSetupNotice(outcome);

    return (
        <Alert status={notice.status}>
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>{notice.title}</Alert.Title>
                <Alert.Description>{notice.description}</Alert.Description>
            </Alert.Content>
            <CloseButton aria-label="Dismiss" onPress={dismiss} />
        </Alert>
    );
}
