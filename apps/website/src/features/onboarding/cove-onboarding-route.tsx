import * as React from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ActivationLoading } from '../../components/activation/activation-loading.tsx';
import { ActivationShell, ActivationStep } from '../../components/activation/activation-shell.tsx';
import { useServer } from '../../hooks/servers/use-server.ts';
import { rememberLastServerSlug } from '../servers/server-choice.ts';
import { CoveComputerStep } from './cove-computer-step.tsx';
import { CoveMeetStep } from './cove-meet-step.tsx';
import { getCoveOnboardingView, resolveCoveAppHandoff } from './cove-onboarding-model.ts';
import { SetupProgressMarker } from './cove-step-parts.tsx';
import { ServerSetupWaiting } from './server-setup-waiting.tsx';

/** Mandatory fresh-Server gate, structurally outside the general Server shell. */
export function CoveOnboardingRoute() {
    const { slug = '' } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const wasGated = React.useRef<string | null>(null);
    const server = useServer(slug);
    const resolvedSlug = server.data?.slug;
    React.useEffect(() => {
        if (resolvedSlug === slug) {
            rememberLastServerSlug(resolvedSlug);
        }
    }, [resolvedSlug, slug]);

    if (server.error && !server.data) {
        return (
            <ActivationShell>
                <ActivationStep description={server.error.message} title="Server Unavailable" />
            </ActivationShell>
        );
    }
    if (!server.data) {
        return <ActivationLoading />;
    }

    const canManageOnboarding = server.data.role === 'owner';
    if (!canManageOnboarding) {
        return server.data.onboarding.phase === 'complete' ? (
            <Outlet />
        ) : (
            <ServerSetupWaiting serverName={server.data.displayName} />
        );
    }

    const view = getCoveOnboardingView(server.data.onboarding);
    if (view === 'app') {
        const serverRoot = `/s/${server.data.slug}`;
        const target = `/s/${server.data.slug}/chats/${server.data.onboarding.channelId}`;
        const handoff = resolveCoveAppHandoff({
            onboardingChatPath: target,
            pathname: location.pathname,
            pending: wasGated.current === server.data.id,
            serverRootPath: serverRoot,
        });
        if (handoff.redirect) {
            return (
                <>
                    <ActivationLoading />
                    <Navigate replace to={handoff.redirect} />
                </>
            );
        }
        wasGated.current = null;
        return <Outlet />;
    }
    wasGated.current = server.data.id;

    const switchServer = () => navigate('/s?choose');
    const meetingCove = ['meet-cove', 'applying-cove', 'apply-failed'].includes(view);
    return (
        <ActivationShell
            // Once Cove leads the screen, the brand mark would be a second star.
            mark={meetingCove ? null : undefined}
            progress={
                <SetupProgressMarker stage={meetingCove ? 'meet-cove' : 'connect-computer'} />
            }
        >
            {view === 'meet-cove' || view === 'applying-cove' || view === 'apply-failed' ? (
                <CoveMeetStep
                    onboarding={server.data.onboarding}
                    onSwitchServer={switchServer}
                    serverId={server.data.id}
                    view={view}
                />
            ) : (
                <CoveComputerStep
                    failure={server.data.onboarding.failure}
                    onSwitchServer={switchServer}
                    serverName={server.data.displayName}
                    serverSlug={server.data.slug}
                    view={view}
                />
            )}
        </ActivationShell>
    );
}
