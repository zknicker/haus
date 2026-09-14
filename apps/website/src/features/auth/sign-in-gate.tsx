import { ClerkFailed, ClerkLoaded, ClerkLoading, useAuth, useClerk } from '@clerk/clerk-react';
import { Button, Spinner } from '@heroui/react';
import { Fragment, type ReactNode, useEffect, useState } from 'react';
import { ActivationLoading } from '../../components/activation/activation-loading.tsx';
import { ActivationShell, ActivationStep } from '../../components/activation/activation-shell.tsx';
import { getClerkSessionToken, isClerkEnabled } from '../../lib/clerk.tsx';
import { isElectronDesktopApp } from '../../lib/desktop-bridge.ts';
import { useDesktopOAuth } from './use-desktop-oauth.ts';
import { useSignOut } from './use-sign-out.ts';

/**
 * Mandatory sign-in (specs/identity.md): with Clerk configured, the app
 * renders only for a signed-in user. Keyless test builds skip the gate, but a
 * configured Haus App never falls through to authenticated Server routes
 * without a Clerk session.
 */
export function SignInGate({ children }: { children: ReactNode }) {
    if (!isClerkEnabled) {
        return children;
    }

    if (window.location.pathname === '/sso-callback') {
        return children;
    }

    return (
        <>
            <ClerkLoading>
                <ActivationLoading />
            </ClerkLoading>
            <ClerkFailed>
                <SignInGateFrame signIn />
            </ClerkFailed>
            {/* ClerkLoaded also covers the degraded status (degraded implies
                loaded). The session gate also requires the token used by the
                Server client, so stale Clerk UI state cannot open signed API
                routes without usable authentication. */}
            <ClerkLoaded>
                <ClerkSessionGate>{children}</ClerkSessionGate>
            </ClerkLoaded>
        </>
    );
}

function ClerkSessionGate({ children }: { children: ReactNode }) {
    const { isLoaded, isSignedIn, sessionId, userId } = useAuth();
    const signOut = useSignOut();
    const [tokenSnapshot, setTokenSnapshot] = useState<ClerkSessionTokenSnapshot>({
        sessionId: null,
        state: 'loading',
    });
    const [retryKey, setRetryKey] = useState(0);

    useEffect(() => {
        // The retry key intentionally starts a fresh token read.
        void retryKey;
        let active = true;

        if (!(isLoaded && isSignedIn && sessionId)) {
            setTokenSnapshot({ sessionId: null, state: 'missing' });
            return;
        }

        setTokenSnapshot({ sessionId, state: 'loading' });
        void readClerkSessionToken(getClerkSessionToken).then((state) => {
            if (active) {
                setTokenSnapshot({ sessionId, state });
            }
        });

        return () => {
            active = false;
        };
    }, [isLoaded, isSignedIn, retryKey, sessionId]);

    const tokenState = resolveClerkSessionTokenState(tokenSnapshot, sessionId);
    const gate = resolveClerkSessionGate({ isLoaded, isSignedIn, tokenState, userId });

    if (gate.kind === 'signed-out') {
        return <SignInGateFrame signIn={isLoaded} />;
    }

    if (gate.kind === 'loading') {
        return <ActivationLoading />;
    }

    if (gate.kind === 'missing') {
        return (
            <SignInSessionRecovery
                onRetry={() => setRetryKey((key) => key + 1)}
                onSignOut={signOut}
            />
        );
    }

    return <Fragment key={gate.userId}>{children}</Fragment>;
}

/** The signed-in-but-unusable-session repair screen. */
export function SignInSessionRecovery({
    onRetry,
    onSignOut,
}: {
    onRetry: () => void;
    onSignOut: () => void;
}) {
    return (
        <SignInGateFrame
            message="We couldn’t open your signed-in session."
            recovery={
                <>
                    <Button onPress={onRetry}>Try again</Button>
                    <Button onPress={onSignOut} variant="outline">
                        Sign in again
                    </Button>
                </>
            }
        />
    );
}

type ClerkSessionTokenState = 'loading' | 'ready' | 'missing';
interface ClerkSessionTokenSnapshot {
    sessionId: string | null;
    state: ClerkSessionTokenState;
}
type ClerkSessionGateState =
    | { kind: 'signed-out' }
    | { kind: 'loading' }
    | { kind: 'missing' }
    | { kind: 'authenticated'; userId: string };

export function resolveClerkSessionGate({
    isLoaded,
    isSignedIn,
    tokenState,
    userId,
}: {
    isLoaded: boolean;
    isSignedIn: boolean | undefined;
    tokenState: ClerkSessionTokenState;
    userId: string | null | undefined;
}): ClerkSessionGateState {
    if (!isLoaded) {
        return { kind: 'loading' };
    }
    if (!isSignedIn) {
        return { kind: 'signed-out' };
    }
    if (tokenState === 'missing') {
        return { kind: 'missing' };
    }
    if (tokenState === 'loading' || !userId) {
        return { kind: 'loading' };
    }
    return { kind: 'authenticated', userId };
}

export function resolveClerkSessionTokenState(
    snapshot: ClerkSessionTokenSnapshot,
    currentSessionId: string | null | undefined
): ClerkSessionTokenState {
    if (!(currentSessionId && snapshot.sessionId === currentSessionId)) {
        return 'loading';
    }
    return snapshot.state;
}

export async function readClerkSessionToken(
    getToken: () => Promise<string | null>
): Promise<ClerkSessionTokenState> {
    try {
        return (await getToken()) ? 'ready' : 'missing';
    } catch {
        return 'missing';
    }
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
                        <SignInAction />
                    ) : (
                        <Spinner aria-label="Opening your session" size="sm" />
                    ))
                }
                title="Welcome to Haus"
            />
        </ActivationShell>
    );
}

/**
 * Clerk's `SignInButton` drives its child through a cloned `onClick`, which
 * HeroUI's Button (React Aria) deliberately drops in favour of `onPress`. The
 * modal is opened directly instead — the same call `SignInButton mode="modal"`
 * makes.
 */
function SignInAction() {
    const clerk = useClerk();

    if (isElectronDesktopApp()) {
        return <DesktopGoogleSignIn />;
    }

    return <Button onPress={() => clerk.openSignIn()}>Sign in</Button>;
}

function DesktopGoogleSignIn() {
    const { cancelGoogleSignIn, startGoogleSignIn } = useDesktopOAuth();
    const [error, setError] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);

    const handleSignIn = async () => {
        setError(null);
        setIsStarting(true);

        try {
            await startGoogleSignIn();
        } catch (signInError) {
            if (!(signInError instanceof Error && signInError.name === 'AbortError')) {
                setError(getErrorMessage(signInError));
            }
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
                <Button
                    isPending={isStarting}
                    onPress={() => {
                        void handleSignIn();
                    }}
                >
                    {isStarting ? 'Waiting for Google…' : 'Continue with Google'}
                </Button>
                {isStarting ? (
                    <Button onPress={cancelGoogleSignIn} variant="outline">
                        Cancel
                    </Button>
                ) : null}
            </div>
            {error ? <p className="max-w-sm text-center text-danger text-sm">{error}</p> : null}
        </div>
    );
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Google sign-in failed. Please try again.';
}
