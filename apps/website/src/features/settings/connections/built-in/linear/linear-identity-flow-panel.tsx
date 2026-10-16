import type { Agent, LinearIdentity } from '@haus/api';
import { Button } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { useState } from 'react';
import { EntityAvatar } from '../../../../../components/ui/entity-avatar.tsx';
import { useLinearStartIdentityInstall } from '../../../../../hooks/linear/use-linear-start-identity-install.ts';
import { SettingsRowError } from '../../../layout/settings-text.tsx';
import { LinearIdentityCredentialsStep } from './linear-identity-credentials-step.tsx';
import {
    type LinearIdentityFlowMode,
    type LinearIdentityFlowStepId,
    linearIdentityFlowSteps,
    linearIdentityFlowValues,
    linearIdentityRegisterHint,
    linearIdentityValuesShown,
} from './linear-identity-flow-model.ts';
import { LinearIdentityFlowStepRow } from './linear-identity-flow-step.tsx';
import { LinearIdentityPreview } from './linear-identity-preview.tsx';
import { LinearIdentityValues } from './linear-identity-values.tsx';
import { LinearSetupHeight } from './linear-setup-motion.tsx';
import { rememberLinearIdentityInstall } from './use-linear-identity-arrival.ts';

/**
 * The guided setup for one Agent's own Linear app, expanding under that
 * Agent's access row rather than in a dialog, so Linear's page (a browser tab
 * beside Settings on desktop, another tab on the web) stays usable alongside
 * it. Every value and whether the credentials are saved come from the
 * Server's identity, so a resumed setup picks up where it stopped. The steps
 * wait until the draft lands in the identity list.
 */
export function LinearIdentityFlowPanel({
    agent,
    connectionId,
    draftError,
    identity,
    mode,
    onClose,
    onConnectExisting,
    serverId,
}: {
    agent: Agent;
    connectionId: string;
    draftError: string | null;
    identity: LinearIdentity | null;
    mode: LinearIdentityFlowMode;
    onClose: () => void;
    /** Switches to checking an app the Owner already made in Linear; Linear's app list opens beside it. */
    onConnectExisting: () => void;
    serverId: string;
}) {
    const rotating = identity !== null && identity.status !== 'draft';

    return (
        <section aria-label={flowHeading(agent, mode, identity)} className="pb-2">
            <ItemCard variant="transparent">
                <EntityAvatar name={agent.displayName} size="sm" src={agent.avatarUrl} />
                <ItemCard.Content>
                    {/* The panel's title outranks its step rows: section-heading role. */}
                    <h3 className="font-semibold text-base text-foreground">
                        {flowHeading(agent, mode, identity)}
                    </h3>
                </ItemCard.Content>
                <ItemCard.Action>
                    <Button onPress={onClose} size="sm" variant="ghost">
                        Cancel
                    </Button>
                </ItemCard.Action>
            </ItemCard>
            {/* Every change below the header (the draft arriving, a step
                collapsing as the next opens) grows or shrinks on one spring. */}
            <LinearSetupHeight>
                {mode === 'create' && !rotating ? (
                    <div className="ps-15 pe-4 pb-3">
                        <LinearIdentityPreview agent={agent} />
                    </div>
                ) : null}
                {identity ? (
                    <FlowSteps
                        connectionId={connectionId}
                        identity={identity}
                        mode={mode}
                        onClose={onClose}
                        onConnectExisting={onConnectExisting}
                        serverId={serverId}
                    />
                ) : (
                    <div className="ps-15 pe-4">
                        <SettingsRowError>{draftError}</SettingsRowError>
                    </div>
                )}
            </LinearSetupHeight>
        </section>
    );
}

function FlowSteps({
    connectionId,
    identity,
    mode,
    onClose,
    onConnectExisting,
    serverId,
}: {
    connectionId: string;
    identity: LinearIdentity;
    mode: LinearIdentityFlowMode;
    onClose: () => void;
    onConnectExisting: () => void;
    serverId: string;
}) {
    const draft = identity.guidedFlow;
    const install = useLinearStartIdentityInstall(serverId);
    const installing = identity.status === 'draft';
    const [registered, setRegistered] = useState(false);
    const [editing, setEditing] = useState<LinearIdentityFlowStepId | null>(null);
    const [awaitingReturn, setAwaitingReturn] = useState(false);
    // Switching to an existing app keeps this state, so its values show by mode.
    const [valuesRevealed, setValuesRevealed] = useState(false);
    const valuesShown = valuesRevealed || linearIdentityValuesShown(draft, mode);
    const steps = linearIdentityFlowSteps({
        credentialsSaved: identity.credentialsSaved,
        editing,
        installing,
        mode,
        registered,
    });
    const openInLinear = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        setAwaitingReturn(true);
    };
    const finishRegister = () => {
        setRegistered(true);
        setEditing(null);
    };

    return steps.map((step, index) => (
        <LinearIdentityFlowStepRow
            hint={step.id === 'register' ? linearIdentityRegisterHint(draft, mode) : undefined}
            key={step.id}
            number={index + 1}
            onEdit={step.id === 'install' ? undefined : () => setEditing(step.id)}
            step={step}
        >
            {step.id === 'register' ? (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        {mode === 'create' ? (
                            <>
                                <Button
                                    onPress={() => {
                                        openInLinear(draft.createAppUrl);
                                        finishRegister();
                                    }}
                                    size="sm"
                                >
                                    Create in Linear
                                </Button>
                                <Button
                                    onPress={() => {
                                        openInLinear(draft.appsUrl);
                                        onConnectExisting();
                                    }}
                                    size="sm"
                                    variant="secondary"
                                >
                                    Use an existing app
                                </Button>
                                {valuesShown ? null : (
                                    <Button
                                        onPress={() => setValuesRevealed(true)}
                                        size="sm"
                                        variant="ghost"
                                    >
                                        Enter values by hand
                                    </Button>
                                )}
                            </>
                        ) : (
                            <>
                                <Button onPress={finishRegister} size="sm">
                                    Next
                                </Button>
                                <Button
                                    onPress={() => openInLinear(draft.appsUrl)}
                                    size="sm"
                                    variant="secondary"
                                >
                                    Open apps in Linear
                                </Button>
                            </>
                        )}
                    </div>
                    {valuesShown ? (
                        <LinearIdentityValues values={linearIdentityFlowValues(draft, mode)} />
                    ) : null}
                </>
            ) : null}
            {step.id === 'credentials' ? (
                <LinearIdentityCredentialsStep
                    awaitingReturn={awaitingReturn}
                    connectionId={connectionId}
                    identity={identity}
                    onSaved={() => {
                        setEditing(null);
                        // An installed app only rotates its secret; nothing is left to do.
                        if (!installing) {
                            onClose();
                        }
                    }}
                    serverId={serverId}
                />
            ) : null}
            {step.id === 'install' ? (
                <Button
                    isPending={install.isPending}
                    onPress={() => {
                        rememberLinearIdentityInstall(identity.id);
                        void install.start(identity.id).then(onClose);
                    }}
                    size="sm"
                >
                    Install in Linear
                </Button>
            ) : null}
        </LinearIdentityFlowStepRow>
    ));
}

function flowHeading(agent: Agent, mode: LinearIdentityFlowMode, identity: LinearIdentity | null) {
    if (identity && identity.status !== 'draft') {
        return `Replace ${agent.displayName}'s webhook secret`;
    }
    return mode === 'existing'
        ? `Connect ${agent.displayName}'s Linear app`
        : `Give ${agent.displayName} its own Linear app`;
}
