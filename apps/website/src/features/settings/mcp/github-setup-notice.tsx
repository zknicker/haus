import { Alert, CloseButton } from '@heroui/react';
import { useGithubSetupOutcome } from '../../../hooks/github/use-github-setup-outcome.ts';
import { githubSetupNotice } from './github-installation-model.ts';

/** What GitHub's install redirect brought back, until the reader dismisses it. */
export function GithubSetupNotice() {
    const { dismiss, outcome } = useGithubSetupOutcome();
    if (!outcome) {
        return null;
    }
    const notice = githubSetupNotice(outcome);

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
