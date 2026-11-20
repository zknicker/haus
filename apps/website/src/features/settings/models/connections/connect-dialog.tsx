import type { ModelConnection, ModelProvider } from '@haus/api';
import { Segment } from '@heroui-pro/react';
import { Modal, toast } from '@heroui/react';
import { TRPCClientError } from '@trpc/client';
import * as React from 'react';
import { useReplaceModelConnection } from '../../../../hooks/servers/use-model-connections.ts';
import {
    useCancelModelSignIn,
    useModelSignIn,
} from '../../../../hooks/servers/use-model-sign-in.ts';
import { DeviceSignInFlow } from './device-sign-in.tsx';
import {
    connectFlows,
    connectionErrorMessage,
    connectionName,
    modelProviderNames,
    nextConnectionLabel,
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
    const replace = useReplaceModelConnection(serverId);
    const flow = flows[flowIndex] ?? flows[0];
    if (!flow) {
        return null;
    }
    const name = connectionName({ authKind: flow.kind, provider });
    const defaultLabel = nextConnectionLabel(replacing?.label ?? flow.defaultLabel, takenLabels);

    const requestClose = async () => {
        const step = signInId ? signInCloseStep(signIn.data) : 'close';
        if (step === 'close') {
            onClose();
        }
        if (!(signInId && step === 'cancel')) {
            return;
        }
        try {
            const result = await cancel.mutateAsync({ serverId, signInId });
            if (result.cancelled || result.reason === 'finished') {
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

    const onConnected = async (connectionId: string, label: string) => {
        try {
            if (replacing) {
                await replace(replacing, connectionId);
            }
            toast.success(`${name} connected`, { description: replacing?.label ?? label });
        } catch (cause) {
            toast.danger(`${name} connected, but the old connection is still there`, {
                description: connectionErrorMessage(cause),
            });
        }
        onClose();
    };

    const choice =
        flows.length > 1 && !replacing ? (
            <Segment
                aria-label={`How to connect ${modelProviderNames[provider]}`}
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
            isDismissable
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
                            cancelling={cancel.isPending}
                            defaultLabel={defaultLabel}
                            key={flow.choice}
                            labelLocked={replacing !== undefined}
                            onCancel={() => void requestClose()}
                            onConnected={(connectionId, label) => {
                                void onConnected(connectionId, label);
                            }}
                            onRestart={() => setSignInId(null)}
                            onStarted={setSignInId}
                            provider={flow.signInProvider}
                            serverId={serverId}
                            signInId={signInId}
                        >
                            {choice}
                        </DeviceSignInFlow>
                    ) : (
                        <PastedCredentialForm
                            defaultLabel={defaultLabel}
                            key={flow.choice}
                            kind={flow.kind}
                            labelLocked={replacing !== undefined}
                            onCancel={onClose}
                            onConnected={onConnected}
                            provider={provider}
                            serverId={serverId}
                        >
                            {choice}
                        </PastedCredentialForm>
                    )}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}
