import type * as React from 'react';
import { ActivationLoading } from '../../components/activation/activation-loading.tsx';
import { ActivationShell } from '../../components/activation/activation-shell.tsx';
import { isClerkEnabled } from '../../lib/clerk.tsx';
import { SignInGateFrame, SignInSessionRecovery } from '../auth/sign-in-gate.tsx';
import { ComputerLoginApproval } from '../computers/computer-login-view.tsx';
import { ServerChoiceFlow } from '../servers/server-choice-flow.tsx';
import { previewServerSummaries } from './activation-preview-fixtures.ts';

export const activationPreviewBasePath = '/prototype/activation';

export interface ActivationPreviewScene {
    description: string;
    group: 'Sign in' | 'Servers' | 'Invitation' | 'Computer login' | 'Cove onboarding';
    id: string;
    /** Path under the preview base; defaults to the scene id. */
    path?: string;
    /** Scenes without a render mount a real routed page at `path`. */
    render?: () => React.ReactNode;
}

const noop = () => undefined;

export const activationPreviewScenes: ActivationPreviewScene[] = [
    {
        description: 'The signed-out entry with the sign-in action.',
        group: 'Sign in',
        id: 'sign-in',
        render: () =>
            isClerkEnabled ? (
                <SignInGateFrame signIn />
            ) : (
                <SignInGateFrame
                    message="Sign in to open your Haus. (Set VITE_CLERK_PUBLISHABLE_KEY to preview the sign-in action.)"
                    signIn={false}
                />
            ),
    },
    {
        description: 'Clerk or the session token is still loading.',
        group: 'Sign in',
        id: 'sign-in-loading',
        render: () => <ActivationLoading />,
    },
    {
        description: 'Signed in, but the session token is unusable.',
        group: 'Sign in',
        id: 'sign-in-recovery',
        render: () => <SignInSessionRecovery onRetry={noop} onSignOut={noop} />,
    },
    {
        description: 'No joined Server yet: offer Create and Join.',
        group: 'Servers',
        id: 'first-server',
        render: () => (
            <ActivationShell>
                <ServerChoiceFlow servers={[]} />
            </ActivationShell>
        ),
    },
    {
        description: 'Joined Servers listed, with Create and Join actions.',
        group: 'Servers',
        id: 'server-choice',
        render: () => (
            <ActivationShell>
                <ServerChoiceFlow servers={previewServerSummaries} />
            </ActivationShell>
        ),
    },
    {
        description: 'The focused Create a Server step. Creating is stubbed.',
        group: 'Servers',
        id: 'server-create',
        render: () => (
            <ActivationShell>
                <ServerChoiceFlow initialView="create" servers={[]} />
            </ActivationShell>
        ),
    },
    {
        description: 'The focused Join a Server step.',
        group: 'Servers',
        id: 'server-join',
        render: () => (
            <ActivationShell>
                <ServerChoiceFlow initialView="join" servers={[]} />
            </ActivationShell>
        ),
    },
    {
        description: 'A valid invitation ready to accept. Accepting is stubbed.',
        group: 'Invitation',
        id: 'invite-ready',
        path: 'invite/preview-ready',
    },
    {
        description: 'The invitation is bound to a different verified email.',
        group: 'Invitation',
        id: 'invite-wrong-account',
        path: 'invite/preview-mismatch',
    },
    {
        description: 'A revoked, used, or expired invitation.',
        group: 'Invitation',
        id: 'invite-unavailable',
        path: 'invite/preview-expired',
    },
    {
        description: 'No code yet: enter the code from `haus-computer login`.',
        group: 'Computer login',
        id: 'computer-login',
        render: () => <SignedInComputerLogin />,
    },
    {
        description: 'A pending code, signed in. Approve plays the full arc live.',
        group: 'Computer login',
        id: 'computer-login-pending',
        path: 'computer-login-pending?code=GROT-DEMO',
        render: () => <SignedInComputerLogin />,
    },
    {
        description: 'A pending code while signed out.',
        group: 'Computer login',
        id: 'computer-login-signed-out',
        path: 'computer-login-signed-out?code=GROT-DEMO',
        render: () => (
            <ComputerLoginApproval
                accountLabel={null}
                onSignIn={noop}
                onSwitchAccount={noop}
                signedIn={false}
            />
        ),
    },
    {
        description: 'Setup finished; the page invites you to close it.',
        group: 'Computer login',
        id: 'computer-login-done',
        path: 'computer-login-done?code=GROT-DONE',
        render: () => <SignedInComputerLogin />,
    },
    {
        description: 'An expired login code.',
        group: 'Computer login',
        id: 'computer-login-expired',
        path: 'computer-login-expired?code=GROT-EXPD',
        render: () => <SignedInComputerLogin />,
    },
    {
        description: 'Fresh Server: install and setup commands, nothing connected.',
        group: 'Cove onboarding',
        id: 'onboarding-connect',
        path: 'onboarding/preview-connect-computer',
    },
    {
        description: 'A member waits for the owner to finish setup.',
        group: 'Cove onboarding',
        id: 'onboarding-member',
        path: 'onboarding/preview-member',
    },
    {
        description: 'An admin also waits for the owner to finish setup.',
        group: 'Cove onboarding',
        id: 'onboarding-admin',
        path: 'onboarding/preview-admin',
    },
    {
        description: 'The Computer connected and is reporting runtimes.',
        group: 'Cove onboarding',
        id: 'onboarding-detecting',
        path: 'onboarding/preview-detecting',
    },
    {
        description: 'Setup stopped before runtimes were reported.',
        group: 'Cove onboarding',
        id: 'onboarding-connect-failed',
        path: 'onboarding/preview-connect-failed',
    },
    {
        description: 'Choose Cove’s runtime and model. Creating is stubbed.',
        group: 'Cove onboarding',
        id: 'onboarding-meet-cove',
        path: 'onboarding/preview-meet-cove',
    },
    {
        description: 'Cove is being created on the Computer.',
        group: 'Cove onboarding',
        id: 'onboarding-applying',
        path: 'onboarding/preview-applying',
    },
    {
        description: 'The Computer went offline mid-creation; reconnect recovers.',
        group: 'Cove onboarding',
        id: 'onboarding-apply-failed',
        path: 'onboarding/preview-apply-failed',
    },
    {
        description: 'Cove’s setup errored on a live Computer; retry with logs hint.',
        group: 'Cove onboarding',
        id: 'onboarding-apply-error',
        path: 'onboarding/preview-apply-error',
    },
];

function SignedInComputerLogin() {
    return (
        <ComputerLoginApproval
            accountLabel="Zach Knickerbocker"
            onSignIn={noop}
            onSwitchAccount={noop}
            signedIn
        />
    );
}

export function activationScenePath(scene: ActivationPreviewScene): string {
    return `${activationPreviewBasePath}/${scene.path ?? scene.id}`;
}

export function findActivationScene(
    pathname: string,
    search: string
): ActivationPreviewScene | null {
    const exact = activationPreviewScenes.find(
        (scene) => activationScenePath(scene) === `${pathname}${search}`
    );
    if (exact) {
        return exact;
    }
    return (
        activationPreviewScenes.find(
            (scene) => activationScenePath(scene).split('?')[0] === pathname
        ) ?? null
    );
}

export function findActivationSceneById(sceneId: string): ActivationPreviewScene | null {
    return activationPreviewScenes.find((scene) => scene.id === sceneId) ?? null;
}
