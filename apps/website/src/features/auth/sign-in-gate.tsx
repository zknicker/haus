import { Button, Spinner } from '@heroui/react';
import { Fragment, type ReactNode, useState } from 'react';
import { ActivationLoading } from '../../components/activation/activation-loading.tsx';
import { ActivationShell, ActivationStep } from '../../components/activation/activation-shell.tsx';
import { useAppAuth } from '../../lib/app-auth.tsx';
import type { AppAuthSnapshot } from '../../lib/app-auth-session.ts';
import { getDesktopBridge, isElectronDesktopApp } from '../../lib/desktop-bridge.ts';

/** Every product route uses a current, Server-issued App session. */
export function SignInGate({ children }: { children: ReactNode }) {
    const { refresh, session, signIn, snapshot } = useAppAuth();
    const gate = resolveSignInGate(snapshot);

    if (gate === 'loading') {
        return <ActivationLoading />;
    }
    if (gate === 'recovery' && snapshot.kind === 'failed') {
        return (
            <SignInSessionRecovery
                message={snapshot.message}
                onRetry={() => void refresh()}
                onSignIn={() => void signIn(true)}
            />
        );
    }
    if (gate === 'signed-out') {
        return <SignInGateFrame signIn />;
    }
    return session ? (
        <Fragment key={session.user.id}>{children}</Fragment>
    ) : (
        <SignInGateFrame signIn />
    );
}

export function resolveSignInGate(snapshot: AppAuthSnapshot) {
    if (snapshot.kind === 'loading') {
        return 'loading';
    }
    if (snapshot.kind === 'failed') {
        return 'recovery';
    }
    return snapshot.session ? 'authenticated' : 'signed-out';
}

export function SignInSessionRecovery({
    message = 'We couldn’t open your signed-in session.',
    onRetry,
    onSignIn,
}: {
    message?: string;
    onRetry: () => void;
    onSignIn: () => void;
}) {
    return (
        <SignInGateFrame
            message={message}
            recovery={
                <>
                    <Button onPress={onRetry}>Try again</Button>
                    <Button onPress={onSignIn} variant="outline">
                        Continue with Google
                    </Button>
                </>
            }
        />
    );
}

export function SignInGateFrame({
    message = 'Sign in to open your Haus.',
    recovery,
    signIn = false,
}: {
    message?: string;
    recovery?: ReactNode;
    signIn?: boolean;
}) {
    return (
        <ActivationShell>
            <ActivationStep
                description={message}
                footer={
                    recovery ??
                    (signIn ? (
                        <GoogleSignIn />
                    ) : (
                        <Spinner aria-label="Opening your session" size="sm" />
                    ))
                }
                title="Welcome to Haus"
            />
        </ActivationShell>
    );
}

function GoogleSignIn() {
    return isElectronDesktopApp() ? <DesktopGoogleSignIn /> : <BrowserGoogleSignIn />;
}

function BrowserGoogleSignIn() {
    const { signIn } = useAppAuth();
    const [error, setError] = useState<string | null>(null);
    return (
        <div className="flex flex-col items-center gap-2">
            <Button
                onPress={() => {
                    setError(null);
                    void signIn().catch((reason: unknown) => setError(errorMessage(reason)));
                }}
            >
                Continue with Google
            </Button>
            {error ? <p className="max-w-sm text-center text-danger text-sm">{error}</p> : null}
        </div>
    );
}

function DesktopGoogleSignIn() {
    const { signIn } = useAppAuth();
    const [error, setError] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);

    const startGoogleSignIn = async () => {
        setError(null);
        setIsStarting(true);
        try {
            await signIn();
        } catch (reason) {
            if (!(reason instanceof Error && reason.name === 'AbortError')) {
                setError(errorMessage(reason));
            }
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
                <Button isPending={isStarting} onPress={() => void startGoogleSignIn()}>
                    Continue with Google
                </Button>
                {isStarting ? (
                    <Button
                        onPress={() => void getDesktopBridge()?.authCancelSignIn?.()}
                        variant="outline"
                    >
                        Cancel
                    </Button>
                ) : null}
            </div>
            {error ? <p className="max-w-sm text-center text-danger text-sm">{error}</p> : null}
        </div>
    );
}

function errorMessage(_error: unknown) {
    return 'Google sign-in didn’t start. Please try again.';
}
