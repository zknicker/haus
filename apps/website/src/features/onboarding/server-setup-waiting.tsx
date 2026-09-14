import { Button } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { ActivationShell, ActivationStep } from '../../components/activation/activation-shell.tsx';
import { isClerkEnabled } from '../../lib/clerk.tsx';
import { useSignOut } from '../auth/use-sign-out.ts';

export function ServerSetupWaiting({ serverName }: { serverName: string }) {
    const navigate = useNavigate();
    return (
        <ActivationShell>
            <ActivationStep
                description="The server owner is still setting up this server. Please check again later."
                footer={
                    <>
                        <Button onPress={() => navigate('/s?choose')} variant="secondary">
                            Choose another Server
                        </Button>
                        {isClerkEnabled ? <SignOutButton /> : null}
                    </>
                }
                title={serverName}
            />
        </ActivationShell>
    );
}

function SignOutButton() {
    const signOut = useSignOut();
    return (
        <Button onPress={signOut} variant="ghost">
            Sign out
        </Button>
    );
}
