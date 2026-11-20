import type {
    ModelConnection,
    ModelConnectionCredential,
    ModelProvider,
    ModelSignInProvider,
} from '@haus/api';
import { Segment } from '@heroui-pro/react';
import { Modal, toast } from '@heroui/react';
import { TRPCClientError } from '@trpc/client';
import * as React from 'react';
import { useModelConnectionEdits } from '../../../../hooks/servers/use-model-connections.ts';
import {
    useCancelModelSignIn,
    useModelSignIn,
    useStartModelSignIn,
} from '../../../../hooks/servers/use-model-sign-in.ts';
import { DeviceSignInFlow } from './device-sign-in.tsx';
import {
    connectFlows,
    connectionErrorMessage,
    connectionName,
    connectLabel,
    modelProviderNames,
    signInCancelStep,
    signInCloseStep,
} from './model-connection-model.ts';
import { PastedCredentialForm } from './pasted-credential-form.tsx';

export function ConnectDialog({
    onClose,
    provider,
    replacing,
    serverId,
    takenLabels,
}: {
    onClose: () => void;
    provider: ModelProvider;
    replacing?: ModelConnection;
    serverId: string;
    takenLabels: readonly string[];
}) {
    const flows = connectFlows[provider];
    const [flowIndex, setFlowIndex] = React.useState(() =>
        Math.max(0, replacing ? flows.findIndex((flow) => flow.kind === replacing.authKind) : 0)
    );
    const [signInId, setSignInId] = React.useState<string | null>(null);
    const signIn = useModelSignIn(serverId, signInId);
    const cancel = useCancelModelSignIn(serverId);
    const start = useStartModelSignIn(serverId);
    const { add, replaceCredential } = useModelConnectionEdits(serverId);
    const busy =
        start.isPending || add.isPending || replaceCredential.isPending || cancel.isPending;
    const flow = flows[flowIndex] ?? flows[0];
    if (!flow) {
        return null;
    }
    const name = connectionName({ authKind: flow.kind, provider });
    const defaultLabel = connectLabel(flow, replacing, takenLabels);

    const requestClose = async () => {
        if (busy) {
            return;
        }
        const step = signInId ? signInCloseStep(signIn.data) : 'close';
        if (step === 'close') {
            onClose();
        }
        if (!(signInId && step === 'cancel')) {
            return;
        }
        try {
            const result = await cancel.mutateAsync({ serverId, signInId });
            if (signInCancelStep(result) === 'close') {
                onClose();
            }
        } catch (cause) {
            if (cause instanceof TRPCClientError && cause.data?.code === 'NOT_FOUND') {
                onClose();
                return;
            }
            toast.danger('Could not cancel the sign-in', {
                description: connectionErrorMessage(cause),
            });
        }
    };

    const startSignIn = async (signInProvider: ModelSignInProvider, label: string) => {
        const started = await start.start({
            label,
            provider: signInProvider,
            ...(replacing ? { replaceConnectionId: replacing.id } : {}),
            serverId,
        });
        if (started) {
            setSignInId(started.signInId);
        }
    };

    const saveCredential = (credential: ModelConnectionCredential, label: string) =>
        replacing
            ? replaceCredential.mutateAsync({ connectionId: replacing.id, credential, serverId })
            : add.mutateAsync({ credential, label, provider, serverId });

    const onConnected = (_connectionId: string, label: string) => {
        toast.success(`${name} ${replacing ? 'reconnected' : 'connected'}`, {
            description: label,
        });
        onClose();
    };

    const choice =
        flows.length > 1 && !replacing ? (
            <Segment
                aria-label={`How to connect ${modelProviderNames[provider]}`}
                isDisabled={busy}
                onSelectionChange={(key) =>
                    setFlowIndex(
                        Math.max(
                            0,
                            flows.findIndex((option) => option.choice === key)
                        )
                    )
                }
                selectedKey={flow.choice}
                size="sm"
            >
                {flows.map((option) => (
                    <Segment.Item id={option.choice} key={option.choice}>
                        {option.choice}
                    </Segment.Item>
                ))}
            </Segment>
        ) : null;

    return (
        <Modal.Backdrop
            isDismissable={!busy}
            isKeyboardDismissDisabled={busy}
            isOpen
            onOpenChange={(open) => {
                if (!open) {
                    void requestClose();
                }
            }}
        >
            <Modal.Container size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>
                            {replacing ? `Reconnect ${replacing.label}` : `Connect ${name}`}
                        </Modal.Heading>
                    </Modal.Header>
                    {flow.kind === 'oauth' ? (
                        <DeviceSignInFlow
                            busy={busy}
                            cancelling={cancel.isPending}
                            defaultLabel={defaultLabel}
                            key={flow.choice}
                            labelLocked={replacing !== undefined}
                            onCancel={() => void requestClose()}
                            onConnected={onConnected}
                            onRestart={() => setSignInId(null)}
                            onStart={(label) => startSignIn(flow.signInProvider, label)}
                            serverId={serverId}
                            signInId={signInId}
                            starting={start.isPending}
                        >
                            {choice}
                        </DeviceSignInFlow>
                    ) : (
                        <PastedCredentialForm
                            busy={busy}
                            defaultLabel={defaultLabel}
                            key={flow.choice}
                            kind={flow.kind}
                            labelLocked={replacing !== undefined}
                            onCancel={() => void requestClose()}
                            onConnected={onConnected}
                            onSave={saveCredential}
                        >
                            {choice}
                        </PastedCredentialForm>
                    )}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}
