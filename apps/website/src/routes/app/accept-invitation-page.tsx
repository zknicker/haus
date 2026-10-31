import { Button, Spinner } from '@heroui/react';
import { useParams } from 'react-router-dom';
import { ActivationShell, ActivationStep } from '../../components/activation/activation-shell.tsx';
import {
    useAcceptInvitation,
    useInvitationPreview,
} from '../../hooks/servers/use-accept-invitation.ts';

/**
 * Where an invited human lands. The Server decides whether their signed-in
 * Verified identity carries the address this invitation is bound to; the
 * page only reports that answer. It never learns whose address it is.
 */
export function AcceptInvitationPage() {
    const { token = '' } = useParams();
    const preview = useInvitationPreview(token);
    const accept = useAcceptInvitation();

    if (preview.error) {
        return (
            <InvitationMessage
                detail="This invitation may have been revoked, already used, or expired. Ask whoever invited you for a new one."
                title="Invitation Unavailable"
            />
        );
    }

    if (!preview.data) {
        return (
            <ActivationShell>
                <Spinner aria-label="Checking your invitation" size="sm" />
            </ActivationShell>
        );
    }

    if (!preview.data.emailMatches) {
        return (
            <InvitationMessage
                detail={`This invitation to ${preview.data.serverDisplayName} is for a different verified email address. Sign in with the address it was sent to, then open this link again.`}
                title="Wrong Account"
            />
        );
    }

    return (
        <ActivationShell>
            <ActivationStep
                description={`You will join /${preview.data.serverSlug} as a member of #all.`}
                footer={
                    <Button isPending={accept.isPending} onPress={() => accept.mutate({ token })}>
                        Accept Invitation
                    </Button>
                }
                title={`Join ${preview.data.serverDisplayName}`}
            >
                {accept.error ? (
                    <p className="text-center text-danger text-sm">{accept.error.message}</p>
                ) : null}
            </ActivationStep>
        </ActivationShell>
    );
}

function InvitationMessage({ detail, title }: { detail: string; title: string }) {
    return (
        <ActivationShell>
            <ActivationStep description={detail} title={title} />
        </ActivationShell>
    );
}
