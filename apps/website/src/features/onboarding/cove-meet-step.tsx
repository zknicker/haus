import { Alert, Button, Card, Label, ListBox, Select } from '@heroui/react';
import * as React from 'react';
import { ActivationStep } from '../../components/activation/activation-shell.tsx';
import { CodeSnippet } from '../../components/code-snippet.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useCreateCove } from '../../hooks/servers/use-create-cove.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import type { CoveOnboardingView } from './cove-onboarding-model.ts';
import { getCoveRepairGuidance } from './cove-onboarding-model.ts';
import { SwitchServerButton } from './cove-step-parts.tsx';

export function CoveMeetStep({
    onboarding,
    onSwitchServer,
    serverId,
    view,
}: {
    onboarding: ServerDetail['onboarding'];
    onSwitchServer: () => void;
    serverId: string;
    view: Extract<CoveOnboardingView, 'apply-failed' | 'applying-cove' | 'meet-cove'>;
}) {
    const computers = useComputers(serverId);
    const createCove = useCreateCove();
    const computer = computers.data?.find((candidate) => candidate.id === onboarding.computerId);
    const runtimes = computer?.reportedInventory?.runtimes ?? [];
    const [chosenRuntimeId, setChosenRuntimeId] = React.useState<string | null>(null);
    const [chosenModelId, setChosenModelId] = React.useState<string | null>(null);
    const runtime =
        runtimes.find((candidate) => candidate.id === (onboarding.runtimeId ?? chosenRuntimeId)) ??
        runtimes[0];
    const model =
        runtime?.models.find(
            (candidate) => candidate.id === (onboarding.modelId ?? chosenModelId)
        ) ?? runtime?.models[0];
    const applying = view === 'applying-cove';
    const canSubmit = Boolean(computer && runtime && model) && !applying;
    const submit = () => {
        if (!(computer && runtime && model)) {
            return;
        }
        createCove.mutate({
            computerId: computer.id,
            modelId: model.id,
            runtimeId: runtime.id,
            serverId,
        });
    };

    return (
        <ActivationStep
            className="activation-step--wide"
            description="Your Server’s onboarding assistant that knows Haus inside and out."
            footer={
                <>
                    <SwitchServerButton onPress={onSwitchServer} />
                    {view === 'apply-failed' || applying ? null : (
                        <Button
                            isDisabled={!canSubmit}
                            isPending={createCove.isPending}
                            onPress={submit}
                        >
                            Create Cove
                        </Button>
                    )}
                </>
            }
            title="Meet Cove"
        >
            <div className="grid gap-4">
                {!applying && (onboarding.failure || createCove.error) ? (
                    <CoveRepairAlert
                        failure={onboarding.failure}
                        retry={
                            view === 'apply-failed'
                                ? { isPending: createCove.isPending, onPress: submit }
                                : null
                        }
                    />
                ) : null}
                <Card>
                    <Card.Content className="grid p-0 md:grid-cols-[14rem_1fr]">
                        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                            <EntityAvatar name="Cove" size={72} src="/prototypes/cove-avatar.png" />
                            <div className="grid gap-0.5">
                                <p className="font-semibold text-lg">Cove</p>
                                <p className="text-muted text-sm">@cove</p>
                            </div>
                        </div>
                        <div className="grid content-center gap-4 border-separator border-t p-6 md:border-t-0 md:border-l">
                            <Select
                                fullWidth
                                isDisabled={view !== 'meet-cove'}
                                onChange={(value) => {
                                    const next = value ? String(value) : null;
                                    setChosenRuntimeId(next);
                                    setChosenModelId(null);
                                }}
                                value={runtime?.id ?? ''}
                                variant="secondary"
                            >
                                <Label>Runtime</Label>
                                <Select.Trigger>
                                    <Select.Value />
                                    <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover>
                                    <ListBox>
                                        {runtimes.map((candidate) => (
                                            <ListBox.Item
                                                id={candidate.id}
                                                key={candidate.id}
                                                textValue={candidate.label}
                                            >
                                                <Label>{candidate.label}</Label>
                                                <ListBox.ItemIndicator />
                                            </ListBox.Item>
                                        ))}
                                    </ListBox>
                                </Select.Popover>
                            </Select>
                            <Select
                                fullWidth
                                isDisabled={view !== 'meet-cove'}
                                onChange={(value) => setChosenModelId(value ? String(value) : null)}
                                value={model?.id ?? ''}
                                variant="secondary"
                            >
                                <Label>Model</Label>
                                <Select.Trigger>
                                    <Select.Value />
                                    <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover>
                                    <ListBox>
                                        {(runtime?.models ?? []).map((candidate) => (
                                            <ListBox.Item
                                                id={candidate.id}
                                                key={candidate.id}
                                                textValue={candidate.label}
                                            >
                                                <Label>{candidate.label}</Label>
                                                <ListBox.ItemIndicator />
                                            </ListBox.Item>
                                        ))}
                                    </ListBox>
                                </Select.Popover>
                            </Select>
                            <p className="text-muted text-sm">
                                Both come from what the Computer reported. You can change them
                                later.
                            </p>
                        </div>
                    </Card.Content>
                </Card>
                {applying ? (
                    <output aria-live="polite" className="text-center text-muted text-sm">
                        Getting Cove ready…
                    </output>
                ) : null}
            </div>
        </ActivationStep>
    );
}

function CoveRepairAlert({
    failure,
    retry,
}: {
    failure: ServerDetail['onboarding']['failure'];
    retry: { isPending: boolean; onPress: () => void } | null;
}) {
    const guidance = getCoveRepairGuidance(failure);
    const retryButton = (className: string) =>
        retry ? (
            <Button
                className={className}
                isPending={retry.isPending}
                onPress={retry.onPress}
                size="sm"
                variant="danger"
            >
                Try again
            </Button>
        ) : null;

    return (
        <Alert role="alert" status="danger">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>{guidance.title}</Alert.Title>
                <Alert.Description>
                    {guidance.remedy}
                    {guidance.command ? (
                        <CodeSnippet className="mt-2" lines={guidance.command} />
                    ) : null}
                    {guidance.note ? <p className="mt-2 text-sm">{guidance.note}</p> : null}
                </Alert.Description>
                {retryButton('mt-2 sm:hidden')}
            </Alert.Content>
            {retryButton('hidden sm:block')}
        </Alert>
    );
}
