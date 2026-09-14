import type * as React from 'react';
import type { ComputerLoginStatus } from './computer-login-view.tsx';

export function loginTitle(status: ComputerLoginStatus | undefined, setupFlow: boolean) {
    switch (status) {
        case 'approved':
            return 'Finishing the connection';
        case 'consumed':
            return setupFlow ? 'Computer connected' : 'Haus Computer signed in';
        case 'denied':
            return 'Computer login denied';
        case 'expired':
            return 'Computer login expired';
        case 'malformed':
            return 'Code not recognized';
        case 'not-found':
            return 'Computer login not found';
        case 'pending':
            return 'Approve Haus Computer?';
        default:
            return 'Sign in Haus Computer';
    }
}

export function loginDescription(
    status: ComputerLoginStatus | undefined,
    signedIn: boolean
): React.ReactNode {
    switch (status) {
        case 'approved':
            return 'Haus Computer is completing its secure connection. Keep this page open for a moment.';
        case 'consumed':
            return 'All done. You can close this browser tab.';
        case 'denied':
            return (
                <>
                    This Computer login was denied. Start <LoginCommand /> again to try another
                    request.
                </>
            );
        case 'expired':
            return (
                <>
                    This Computer login code expired. Start <LoginCommand /> again for a new code.
                </>
            );
        case 'malformed':
            return 'Enter the eight-character code shown in your Haus Computer terminal.';
        case 'not-found':
            return (
                <>
                    No Computer login is waiting for that code. Start <LoginCommand /> again.
                </>
            );
        case 'pending':
            return signedIn
                ? 'Check that this code matches the one on your Computer.'
                : 'Sign in with the account that should own this Computer login.';
        default:
            return (
                <>
                    Enter the code shown by <LoginCommand />.
                </>
            );
    }
}

function LoginCommand() {
    return <code className="font-mono text-foreground">haus-computer login</code>;
}
