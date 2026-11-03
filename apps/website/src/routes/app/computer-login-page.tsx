import { Button } from '@heroui/react';
import {
    ComputerLoginApproval,
    LoginFrame,
} from '../../features/computers/computer-login-view.tsx';
import { useAppAuth } from '../../lib/app-auth.tsx';

export function ComputerLoginPage() {
    const { refresh, session, signIn, snapshot } = useAppAuth();
    if (snapshot.kind === 'loading') {
        return (
            <LoginFrame description="Opening your sign-in session…" title="Sign in Haus Computer" />
        );
    }
    if (snapshot.kind === 'failed') {
        return (
            <LoginFrame
                description={snapshot.message}
                footer={
                    <div className="flex items-center gap-2">
                        <Button onPress={() => void refresh()} variant="outline">
                            Try again
                        </Button>
                        <Button onPress={() => void signIn()}>Continue with Google</Button>
                    </div>
                }
                title="Sign-in unavailable"
            />
        );
    }
    return (
        <ComputerLoginApproval
            accountLabel={session ? (session.user.displayName ?? session.user.email) : null}
            onSignIn={() => void signIn()}
            onSwitchAccount={() => void signIn(true)}
            signedIn={Boolean(session)}
        />
    );
}
