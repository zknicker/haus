import type { ModelSignIn } from '@haus/api';
import { Button, Form, Input, Label, Link, Modal, Spinner, TextField, toast } from '@heroui/react';
import * as React from 'react';
import { CopyButton } from '../../../../components/copy-button.tsx';
import { useModelSignIn } from '../../../../hooks/servers/use-model-sign-in.ts';
import { openSystemBrowserLink } from '../../../../lib/open-external-link.ts';
import { SettingsRowError } from '../../layout/settings-text.tsx';
import { connectionErrorMessage, signInProviderNames } from './model-connection-model.ts';
import { useLandedSignIn } from './use-landed-sign-in.ts';

const FORM_ID = 'model-sign-in-form';

export function DeviceSignInFlow({
    busy,
    cancelling,
    children,
    defaultLabel,
    labelLocked,
    onCancel,
    onConnected,
    onRestart,
    onStart,
    serverId,
    signInId,
    starting,
}: {
    busy: boolean;
    cancelling: boolean;
    children?: React.ReactNode;
    defaultLabel: string;
    labelLocked: boolean;
    onCancel: () => void;
    onConnected: (connectionId: string, label: string) => void;
    onRestart: () => void;
    onStart: (label: string) => Promise<void>;
    serverId: string;
    signInId: string | null;
    starting: boolean;
}) {
    const signIn = useModelSignIn(serverId, signInId);
    const landed = useLandedSignIn(signIn.data, onConnected);

    if (signInId === null) {
        return (
            <SignInLabelStep
                busy={busy}
                defaultLabel={defaultLabel}
                labelLocked={labelLocked}
                onCancel={onCancel}
                onStart={onStart}
                starting={starting}
            >
                {children}
            </SignInLabelStep>
        );
    }

    return (
        <>
            <Modal.Body>
                {signIn.data ? (
                    <DeviceSignInStatus signIn={signIn.data} />
                ) : (
                    <SettingsRowError>{signIn.error?.message}</SettingsRowError>
                )}
            </Modal.Body>
            <Modal.Footer>
                {signIn.data?.state === 'failed' || signIn.error ? (
                    <>
                        <Button isDisabled={busy} onPress={onCancel} variant="secondary">
                            Close
                        </Button>
                        <Button onPress={onRestart}>Try again</Button>
                    </>
                ) : (
                    <Button
                        isDisabled={busy || signIn.data?.state === 'storing' || landed !== null}
                        isPending={cancelling}
                        onPress={onCancel}
                        variant="secondary"
                    >
                        Cancel
                    </Button>
                )}
            </Modal.Footer>
        </>
    );
}

export function DeviceSignInStatus({ signIn }: { signIn: ModelSignIn }) {
    const name = signInProviderNames[signIn.provider];
    switch (signIn.state) {
        case 'waiting-for-code':
            return <SignInProgress>Waiting for a code from {name}…</SignInProgress>;
        case 'code':
            return (
                <div className="flex flex-col gap-3">
                    <p className="text-sm">
                        Open{' '}
                        <Link
                            onPress={() => {
                                openSystemBrowserLink(signIn.verificationUri).catch(() =>
                                    toast.danger(`Could not open ${signIn.verificationUri}`)
                                );
                            }}
                        >
                            {displayUri(signIn.verificationUri)}
                            <Link.Icon />
                        </Link>{' '}
                        and enter this code.
                    </p>
                    <div className="flex items-center gap-2">
                        <span
                            className="font-mono text-2xl font-semibold tracking-widest"
                            data-selectable-text=""
                        >
                            {signIn.userCode}
                        </span>
                        <CopyButton label="Copy code" value={signIn.userCode} />
                    </div>
                    <p className="text-muted text-sm">This closes once {name} confirms.</p>
                </div>
            );
        case 'storing':
            return <SignInProgress>Saving the connection…</SignInProgress>;
        case 'connected':
            return <p className="text-sm">{signIn.label} is connected.</p>;
        case 'failed':
            return <SettingsRowError>{signIn.detail}</SettingsRowError>;
        case 'cancelled':
            return <p className="text-muted text-sm">Sign-in cancelled.</p>;
    }
}

function SignInLabelStep({
    busy,
    children,
    defaultLabel,
    labelLocked,
    onCancel,
    onStart,
    starting,
}: {
    busy: boolean;
    children?: React.ReactNode;
    defaultLabel: string;
    labelLocked: boolean;
    onCancel: () => void;
    onStart: (label: string) => Promise<void>;
    starting: boolean;
}) {
    const [label, setLabel] = React.useState(defaultLabel);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async () => {
        setError(null);
        try {
            await onStart(label.trim());
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
                        if (label.trim() && !busy) {
                            void submit();
                        }
                    }}
                >
                    {labelLocked ? null : (
                        <TextField
                            autoFocus
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
                    <SettingsRowError>{error}</SettingsRowError>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button isDisabled={busy} onPress={onCancel} variant="secondary">
                    Cancel
                </Button>
                <Button
                    form={FORM_ID}
                    isDisabled={label.trim().length === 0}
                    isPending={starting}
                    type="submit"
                >
                    Sign in
                </Button>
            </Modal.Footer>
        </>
    );
}

function SignInProgress({ children }: { children: React.ReactNode }) {
    return (
        <p aria-live="polite" className="text-muted flex items-center gap-2 text-sm">
            <Spinner size="sm" />
            {children}
        </p>
    );
}

function displayUri(uri: string) {
    const url = new URL(uri);
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
}
