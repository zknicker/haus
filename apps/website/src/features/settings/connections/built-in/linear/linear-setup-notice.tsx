import { Alert, CloseButton } from '@heroui/react';
import { useLinearSetupOutcome } from '../../../../../hooks/linear/use-linear-setup-outcome.ts';
import { useProviderReturnLanding } from '../../../../../hooks/provider-return/use-provider-return-landing.ts';
import { linearSetupNotice } from './linear-setup-notice-model.ts';

/**
 * What Linear's install callback brought back, until the reader dismisses
 * it. An identity install shows on its Agent's row instead. On the web, a
 * landing in the tab the install opened hands itself to the tab that started
 * it and closes.
 */
export function LinearSetupNotice() {
    const { dismiss, outcome } = useLinearSetupOutcome();
    useProviderReturnLanding(outcome !== null);
    const notice = outcome ? linearSetupNotice(outcome) : null;
    if (!notice) {
        return null;
    }

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
