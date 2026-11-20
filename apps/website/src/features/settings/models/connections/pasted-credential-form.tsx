import type { ModelConnection, ModelConnectionCredential } from '@haus/api';
import {
    Button,
    Description,
    FieldError,
    Form,
    Input,
    Label,
    Modal,
    TextField,
} from '@heroui/react';
import * as React from 'react';
import { SettingsRowError } from '../../layout/settings-text.tsx';
import {
    connectionErrorMessage,
    type PastedCredentialKind,
    pastedCredential,
} from './model-connection-model.ts';

const FORM_ID = 'model-connection-credential-form';

export function PastedCredentialForm({
    busy,
    children,
    defaultLabel,
    kind,
    labelLocked,
    onCancel,
    onConnected,
    onSave,
}: {
    busy: boolean;
    children?: React.ReactNode;
    defaultLabel: string;
    kind: PastedCredentialKind;
    labelLocked: boolean;
    onCancel: () => void;
    onConnected: (connectionId: string, label: string) => void;
    onSave: (credential: ModelConnectionCredential, label: string) => Promise<ModelConnection>;
}) {
    const [label, setLabel] = React.useState(defaultLabel);
    const [secret, setSecret] = React.useState('');
    const [secretError, setSecretError] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const ready = label.trim().length > 0 && secret.trim().length > 0;

    const submit = async () => {
        const pasted = pastedCredential(kind, secret);
        if (!pasted.ok) {
            setSecretError(pasted.message);
            return;
        }
        setError(null);
        try {
            const connection = await onSave(pasted.credential, label.trim());
            onConnected(connection.id, connection.label);
        } catch (cause) {
            setError(connectionErrorMessage(cause));
        }
    };

    return (
        <>
            <Modal.Body>
                {children}
                <Form
                    className="flex flex-col gap-3"
                    id={FORM_ID}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (ready && !busy) {
                            void submit();
                        }
                    }}
                >
                    {labelLocked ? null : (
                        <TextField
                            fullWidth
                            onChange={(value) => {
                                setLabel(value);
                                setError(null);
                            }}
                            value={label}
                            variant="secondary"
                        >
                            <Label>Name</Label>
                            <Input autoComplete="off" />
                        </TextField>
                    )}
                    <TextField
                        autoFocus
                        fullWidth
                        isInvalid={secretError !== null}
                        onChange={(value) => {
                            setSecret(value);
                            setSecretError(null);
                            setError(null);
                        }}
                        type="password"
                        value={secret}
                        variant="secondary"
                    >
                        <Label>{kind === 'setup-token' ? 'Setup token' : 'API key'}</Label>
                        <Input autoComplete="off" />
                        {kind === 'setup-token' ? (
                            <Description>
                                Run <code>claude setup-token</code> in a terminal and paste the
                                token it prints.
                            </Description>
                        ) : null}
                        <FieldError>{secretError}</FieldError>
                    </TextField>
                    <SettingsRowError>{error}</SettingsRowError>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button isDisabled={busy} onPress={onCancel} variant="secondary">
                    Cancel
                </Button>
                <Button form={FORM_ID} isDisabled={!ready} isPending={busy} type="submit">
                    Connect
                </Button>
            </Modal.Footer>
        </>
    );
}
