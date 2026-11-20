import type { ModelSignIn, ModelSignInProvider } from '@haus/api';
import { Button, Form, Input, Label, Link, Modal, Spinner, TextField, toast } from '@heroui/react';
import * as React from 'react';
import { CopyButton } from '../../../../components/copy-button.tsx';
import {
    useModelSignIn,
    useStartModelSignIn,
} from '../../../../hooks/servers/use-model-sign-in.ts';
import { openSystemBrowserLink } from '../../../../lib/open-external-link.ts';
import { SettingsRowError } from '../../layout/settings-text.tsx';
import { connectionErrorMessage, signInProviderNames } from './model-connection-model.ts';

const FORM_ID = 'model-sign-in-form';

export function DeviceSignInFlow({
    cancelling,
    children,
    defaultLabel,
    labelLocked,
    onCancel,
    onConnected,
    onRestart,
    onStarted,
    provider,
    replaceConnectionId,
    serverId,
    signInId,
}: {
    cancelling: boolean;
    children?: React.ReactNode;
    defaultLabel: string;
    labelLocked: boolean;
    onCancel: () => void;
    onConnected: (connectionId: string, label: string) => void;
    onRestart: () => void;
    onStarted: (signInId: string) => void;
    provider: ModelSignInProvider;
    replaceConnectionId?: string;
    serverId: string;
    signInId: string | null;
}) {
    const signIn = useModelSignIn(serverId, signInId);
    const landed = signIn.data?.state === 'connected' ? signIn.data.connectionId : null;
    const label = signIn.data?.label ?? defaultLabel;
    const announceLanded = React.useEffectEvent((connectionId: string) =>
        onConnected(connectionId, label)
    );
    React.useEffect(() => {
        if (landed) {
            announceLanded(landed);
        }
    }, [landed]);

    if (signInId === null) {
        return (
            <SignInLabelStep
                defaultLabel={defaultLabel}
                labelLocked={labelLocked}
                onCancel={onCancel}
                onStarted={onStarted}
                provider={provider}
                {...(replaceConnectionId ? { replaceConnectionId } : {})}
                serverId={serverId}
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
                        <Button onPress={onCancel} variant="secondary">
                            Close
                        </Button>
                        <Button onPress={onRestart}>Try again</Button>
                    </>
                ) : (
                    <Button
                        isDisabled={signIn.data?.state === 'storing' || landed !== null}
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
    children,
    defaultLabel,
    labelLocked,
    onCancel,
    onStarted,
    provider,
    replaceConnectionId,
    serverId,
}: {
    children?: React.ReactNode;
    defaultLabel: string;
    labelLocked: boolean;
    onCancel: () => void;
    onStarted: (signInId: string) => void;
    provider: ModelSignInProvider;
    replaceConnectionId?: string;
    serverId: string;
}) {
    const start = useStartModelSignIn(serverId);
    const [label, setLabel] = React.useState(defaultLabel);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async () => {
        setError(null);
        try {
            const signIn = await start.mutateAsync({
                label: label.trim(),
                provider,
                ...(replaceConnectionId ? { replaceConnectionId } : {}),
                serverId,
            });
            onStarted(signIn.signInId);
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
                        if (label.trim() && !start.isPending) {
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
                <Button onPress={onCancel} variant="secondary">
                    Cancel
                </Button>
                <Button
                    form={FORM_ID}
                    isDisabled={label.trim().length === 0}
                    isPending={start.isPending}
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
