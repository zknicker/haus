import type { LinearIdentityDraft } from '@haus/api';
import { Button, Form, Input, Label, Modal, TextField } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { useState } from 'react';
import { CopyButton } from '../../../../../components/copy-button.tsx';
import { useLinearSaveIdentityCredentials } from '../../../../../hooks/linear/use-linear-save-identity-credentials.ts';
import { useLinearStartIdentityInstall } from '../../../../../hooks/linear/use-linear-start-identity-install.ts';
import { SettingsRowError } from '../../../layout/settings-text.tsx';
import {
    type LinearIdentityFlowMode,
    linearIdentityCredentialsReady,
    linearIdentityFlowSteps,
    linearIdentityFlowValues,
} from './linear-identity-flow-model.ts';

const formId = 'linear-identity-credentials';

/**
 * The guided flow for one Agent's own Linear app, as one dialog: the values to
 * copy into Linear with a deep link to its new-app page, the two values to
 * paste back, then the install. Opened while the draft is being prepared, so
 * it reads blank until the Server answers.
 */
export function LinearIdentityFlowDialog({
    agentName,
    connectionId,
    draft,
    draftError,
    mode,
    onClose,
    serverId,
}: {
    agentName: string;
    connectionId: string;
    draft: LinearIdentityDraft | null;
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
                        <Modal.Heading>
                            {mode === 'existing'
                                ? `Connect ${agentName}'s Linear app`
                                : `Give ${agentName} a Linear identity`}
                        </Modal.Heading>
                    </Modal.Header>
                    {mode && draft ? (
                        <FlowBody
                            connectionId={connectionId}
                            draft={draft}
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

function FlowBody({
    connectionId,
    draft,
    mode,
    onClose,
    serverId,
}: {
    connectionId: string;
    draft: LinearIdentityDraft;
    mode: LinearIdentityFlowMode;
    onClose: () => void;
    serverId: string;
}) {
    const save = useLinearSaveIdentityCredentials(serverId, connectionId);
    const install = useLinearStartIdentityInstall(serverId);
    const [clientId, setClientId] = useState('');
    const [secret, setSecret] = useState('');
    const [register, credentials, installStep] = linearIdentityFlowSteps({
        credentialsSaved: save.isSaved,
        draftReady: true,
        mode,
    });
    const ready = linearIdentityCredentialsReady(clientId, secret);

    return (
        <>
            <Modal.Body className="grid gap-6">
                <ItemCardGroup variant="transparent">
                    <ItemCardGroup.Header>
                        <ItemCardGroup.Title>1. {register?.title}</ItemCardGroup.Title>
                    </ItemCardGroup.Header>
                    <ItemCardGroup variant="outline">
                        {linearIdentityFlowValues(draft, mode).map((entry) => (
                            <ItemCard key={entry.label}>
                                <ItemCard.Content>
                                    <ItemCard.Title>{entry.label}</ItemCard.Title>
                                    <ItemCard.Description className="max-w-full truncate font-mono">
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
                            if (ready) {
                                save.save({
                                    clientId: clientId.trim(),
                                    identityId: draft.identityId,
                                    webhookSigningSecret: secret.trim(),
                                });
                            }
                        }}
                    >
                        <TextField
                            fullWidth
                            isDisabled={save.isPending || save.isSaved}
                            onChange={setClientId}
                            value={clientId}
                            variant="secondary"
                        >
                            <Label>Client ID</Label>
                            <Input autoComplete="off" />
                        </TextField>
                        <TextField
                            fullWidth
                            isDisabled={save.isPending || save.isSaved}
                            onChange={setSecret}
                            type="password"
                            value={secret}
                            variant="secondary"
                        >
                            <Label>Webhook signing secret</Label>
                            <Input autoComplete="off" />
                        </TextField>
                        <SettingsRowError>{save.error?.message}</SettingsRowError>
                    </Form>
                </ItemCardGroup>
            </Modal.Body>
            <Modal.Footer>
                <Button onPress={onClose} slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                {installStep?.status === 'current' ? (
                    <Button
                        isPending={install.isPending}
                        onPress={() => void install.start(draft.identityId).then(onClose)}
                    >
                        Install in Linear
                    </Button>
                ) : (
                    <Button
                        form={formId}
                        isDisabled={!ready}
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
