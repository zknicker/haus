import type { LinearIdentity } from '@haus/api';
import { Button, Form, Input, Label, Modal, TextField } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { useState } from 'react';
import { CopyButton } from '../../../../../components/copy-button.tsx';
import { useLinearSaveIdentityCredentials } from '../../../../../hooks/linear/use-linear-save-identity-credentials.ts';
import { useLinearStartIdentityInstall } from '../../../../../hooks/linear/use-linear-start-identity-install.ts';
import { SettingsRowError } from '../../../layout/settings-text.tsx';
import {
    type LinearIdentityFlowMode,
    linearIdentityClientIdEditable,
    linearIdentityCredentialsInput,
    linearIdentityFlowSteps,
    linearIdentityFlowValues,
} from './linear-identity-flow-model.ts';

const formId = 'linear-identity-credentials';

/**
 * The guided flow for one Agent's own Linear app, as one dialog: the values to
 * copy into Linear with a deep link to its new-app page, the two values to
 * paste back, then the install. Every value and whether the credentials are
 * saved come from the Server's identity, so a resumed flow picks up where it
 * stopped. Opened while the draft is being prepared, so it reads blank until
 * the identity list answers.
 */
export function LinearIdentityFlowDialog({
    agentName,
    connectionId,
    identity,
    draftError,
    mode,
    onClose,
    serverId,
}: {
    agentName: string;
    connectionId: string;
    identity: LinearIdentity | null;
    draftError: string | null;
    mode: LinearIdentityFlowMode | null;
    onClose: () => void;
    serverId: string;
}) {
    return (
        <Modal.Backdrop
            isDismissable
            isOpen={mode !== null}
            onOpenChange={(open) => !open && onClose()}
        >
            <Modal.Container size="lg">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>{flowHeading(agentName, mode, identity)}</Modal.Heading>
                    </Modal.Header>
                    {mode && identity ? (
                        <FlowBody
                            connectionId={connectionId}
                            identity={identity}
                            mode={mode}
                            onClose={onClose}
                            serverId={serverId}
                        />
                    ) : (
                        <Modal.Body>
                            <SettingsRowError>{draftError}</SettingsRowError>
                        </Modal.Body>
                    )}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function flowHeading(
    agentName: string,
    mode: LinearIdentityFlowMode | null,
    identity: LinearIdentity | null
) {
    if (identity && identity.status !== 'draft') {
        return `${agentName}'s Linear app`;
    }
    return mode === 'existing'
        ? `Connect ${agentName}'s Linear app`
        : `Give ${agentName} a Linear identity`;
}

function FlowBody({
    connectionId,
    identity,
    mode,
    onClose,
    serverId,
}: {
    connectionId: string;
    identity: LinearIdentity;
    mode: LinearIdentityFlowMode;
    onClose: () => void;
    serverId: string;
}) {
    const draft = identity.guidedFlow;
    const save = useLinearSaveIdentityCredentials(serverId, connectionId);
    const install = useLinearStartIdentityInstall(serverId);
    const [clientId, setClientId] = useState('');
    const [secret, setSecret] = useState('');
    const [register, credentials, installStep] = linearIdentityFlowSteps({
        credentialsSaved: identity.credentialsSaved,
        draftReady: true,
        mode,
    });
    const input = linearIdentityCredentialsInput(identity, {
        clientId,
        webhookSigningSecret: secret,
    });
    // Saved values stay editable: typing anything brings Save back over Install.
    const edited = clientId.length > 0 || secret.length > 0;
    const canInstall = !edited && installStep?.status === 'current' && identity.status === 'draft';
    const placeholder = identity.credentialsSaved ? 'Saved' : undefined;

    return (
        <>
            {/* `grid-cols-1` is `minmax(0, 1fr)`: an auto track grows to the
                longest URL, so the body scrolled sideways instead of truncating. */}
            <Modal.Body className="grid grid-cols-1 gap-6">
                <ItemCardGroup variant="transparent">
                    <ItemCardGroup.Header>
                        <ItemCardGroup.Title>1. {register?.title}</ItemCardGroup.Title>
                    </ItemCardGroup.Header>
                    <ItemCardGroup variant="outline">
                        {linearIdentityFlowValues(draft, mode).map((entry) => (
                            <ItemCard key={entry.label}>
                                <ItemCard.Content>
                                    <ItemCard.Title>{entry.label}</ItemCard.Title>
                                    <ItemCard.Description
                                        className="max-w-full truncate font-mono"
                                        title={entry.value}
                                    >
                                        {entry.value}
                                    </ItemCard.Description>
                                </ItemCard.Content>
                                <ItemCard.Action>
                                    <CopyButton label={`Copy ${entry.label}`} value={entry.value} />
                                </ItemCard.Action>
                            </ItemCard>
                        ))}
                    </ItemCardGroup>
                    {mode === 'create' ? (
                        <Button
                            className="justify-self-start"
                            onPress={() =>
                                window.open(draft.createAppUrl, '_blank', 'noopener,noreferrer')
                            }
                            size="sm"
                            variant="secondary"
                        >
                            Open Linear settings
                        </Button>
                    ) : null}
                </ItemCardGroup>
                <ItemCardGroup variant="transparent">
                    <ItemCardGroup.Header>
                        <ItemCardGroup.Title>2. {credentials?.title}</ItemCardGroup.Title>
                    </ItemCardGroup.Header>
                    <Form
                        className="grid gap-4"
                        id={formId}
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (input) {
                                save.save({ ...input, identityId: draft.identityId }, () => {
                                    setClientId('');
                                    setSecret('');
                                });
                            }
                        }}
                    >
                        <TextField
                            fullWidth
                            isDisabled={save.isPending || !linearIdentityClientIdEditable(identity)}
                            onChange={setClientId}
                            value={clientId}
                            variant="secondary"
                        >
                            <Label>Client ID</Label>
                            <Input autoComplete="off" placeholder={placeholder} />
                        </TextField>
                        <TextField
                            fullWidth
                            isDisabled={save.isPending}
                            onChange={setSecret}
                            type="password"
                            value={secret}
                            variant="secondary"
                        >
                            <Label>Webhook signing secret</Label>
                            <Input autoComplete="off" placeholder={placeholder} />
                        </TextField>
                        <SettingsRowError>{save.error?.message}</SettingsRowError>
                    </Form>
                </ItemCardGroup>
            </Modal.Body>
            <Modal.Footer>
                <Button onPress={onClose} slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                {canInstall ? (
                    <Button
                        isPending={install.isPending}
                        onPress={() => void install.start(draft.identityId).then(onClose)}
                    >
                        Install in Linear
                    </Button>
                ) : (
                    <Button
                        form={formId}
                        isDisabled={input === null}
                        isPending={save.isPending}
                        type="submit"
                    >
                        Save
                    </Button>
                )}
            </Modal.Footer>
        </>
    );
}
