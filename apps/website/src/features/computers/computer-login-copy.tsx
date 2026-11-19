import type * as React from 'react';
import type { ComputerLoginStatus } from './computer-login-view.tsx';

export function loginTitle(status: ComputerLoginStatus | undefined, setupFlow: boolean) {
    switch (status) {
        case 'approved':
            return 'Finishing the connection';
        case 'consumed':
            return setupFlow ? 'Device connected' : 'Haus Computer signed in';
        case 'denied':
            return 'Device login denied';
        case 'expired':
            return 'Device login expired';
        case 'malformed':
            return 'Code not recognized';
        case 'not-found':
            return 'Device login not found';
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
                    This device login was denied. Start <LoginCommand /> again to try another
                    request.
                </>
            );
        case 'expired':
            return (
                <>
                    This device login code expired. Start <LoginCommand /> again for a new code.
                </>
            );
        case 'malformed':
            return 'Enter the eight-character code shown in your Haus Computer terminal.';
        case 'not-found':
            return (
                <>
                    No device login is waiting for that code. Start <LoginCommand /> again.
                </>
            );
        case 'pending':
            return signedIn
                ? 'Check that this code matches the one on your device.'
                : 'Sign in with the account that should own this device login.';
        default:
            return (
                <>
                    Enter the code shown by <LoginCommand />.
                </>
            );
    }
}

function LoginCommand() {
    return <code className="text-foreground font-mono">haus-computer login</code>;
}
