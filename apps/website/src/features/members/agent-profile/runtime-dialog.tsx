import type { Agent, ComputerInventory } from '@haus/api';
import { Button, Description, Form, Label, ListBox, Modal, Select } from '@heroui/react';
import { CpuIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';
import { isRuntimeConfigDraftAvailable, type RuntimeConfigDraft } from './runtime-model.ts';

type Runtime = ComputerInventory['runtimes'][number];

export function RuntimeDialog({
    agent,
    error,
    onOpenChange,
    onSave,
    open,
    pending,
    runtimes,
}: {
    agent: Agent;
    error: string | null;
    onOpenChange: (open: boolean) => void;
    onSave: (draft: RuntimeConfigDraft) => Promise<void>;
    open: boolean;
    pending: boolean;
    runtimes: Runtime[];
}) {
    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <RuntimeConfigForm
                        agent={agent}
                        error={error}
                        onSave={onSave}
                        pending={pending}
                        runtimes={runtimes}
                    />
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function RuntimeConfigForm({
    agent,
    error,
    onSave,
    pending,
    runtimes,
}: {
    agent: Agent;
    error: string | null;
    onSave: (draft: RuntimeConfigDraft) => Promise<void>;
    pending: boolean;
    runtimes: Runtime[];
}) {
    const initialRuntime =
        runtimes.find((runtime) => runtime.id === agent.desiredRuntimeId) ?? null;
    const [runtimeId, setRuntimeId] = React.useState(agent.desiredRuntimeId);
    const [modelId, setModelId] = React.useState(agent.desiredModelId);
    const selectedRuntime = runtimes.find((runtime) => runtime.id === runtimeId) ?? null;
    const draft = { modelId, runtimeId };
    const canSave = isRuntimeConfigDraftAvailable(draft, runtimes) && !pending;
    const models = selectedRuntime?.models ?? [];
    const modelIsInstalled = models.some((model) => model.id === modelId);
    const disabledRuntimeKeys = runtimes
        .filter((runtime) => runtime.models.length === 0)
        .map((runtime) => runtime.id);
    if (!initialRuntime) {
        disabledRuntimeKeys.push(agent.desiredRuntimeId);
    }

    return (
        <>
            <Modal.Header>
                {/* Modal.Icon carries no background of its own;
                    the stock idiom pairs it with a soft fill. */}
                <Modal.Icon className="bg-default text-foreground">
                    <Icon className="size-5" icon={CpuIcon} />
                </Modal.Icon>
                <Modal.Heading>Runtime Config</Modal.Heading>
                <p className="mt-1.5 text-muted text-sm leading-5">
                    Choose the installed runtime and model this Agent uses.
                </p>
            </Modal.Header>
            <Modal.Body>
                <Form
                    className="grid gap-4"
                    id="runtime-config-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (canSave) {
                            void onSave(draft).catch(() => undefined);
                        }
                    }}
                >
                    <Select
                        disabledKeys={disabledRuntimeKeys}
                        fullWidth
                        onChange={(value) => {
                            const runtime = runtimes.find(
                                (candidate) => candidate.id === String(value)
                            );
                            if (!runtime) {
                                return;
                            }
                            setRuntimeId(runtime.id);
                            setModelId(runtime.models[0]?.id ?? '');
                        }}
                        value={runtimeId}
                        variant="secondary"
                    >
                        <Label>Runtime</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {initialRuntime ? null : (
                                    <ListBox.Item
                                        id={agent.desiredRuntimeId}
                                        textValue={`${agent.desiredRuntimeId} (not installed)`}
                                    >
                                        {/* The name is the name; whether this
                                            Computer has it is a second fact
                                            about it, in the slot for one. */}
                                        <Label>{agent.desiredRuntimeId}</Label>
                                        <Description>Not installed</Description>
                                    </ListBox.Item>
                                )}
                                {runtimes.map((runtime) => (
                                    <ListBox.Item
                                        id={runtime.id}
                                        key={runtime.id}
                                        textValue={runtime.label}
                                    >
                                        <Label>{runtime.label}</Label>
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                    <Select
                        disabledKeys={modelIsInstalled ? [] : [modelId]}
                        fullWidth
                        isDisabled={!selectedRuntime}
                        onChange={(value) => setModelId(value ? String(value) : '')}
                        value={modelId}
                        variant="secondary"
                    >
                        <Label>Model</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {modelIsInstalled ? null : (
                                    <ListBox.Item
                                        id={modelId}
                                        textValue={`${modelId} (not installed)`}
                                    >
                                        <Label>{modelId}</Label>
                                        <Description>Not installed</Description>
                                    </ListBox.Item>
                                )}
                                {models.map((model) => (
                                    <ListBox.Item
                                        id={model.id}
                                        key={model.id}
                                        textValue={model.label}
                                    >
                                        <Label>{model.label}</Label>
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                    <SettingsRowError>{error}</SettingsRowError>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button isDisabled={pending} slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form="runtime-config-form"
                    isDisabled={!canSave}
                    isPending={pending}
                    type="submit"
                >
                    Save
                </Button>
            </Modal.Footer>
        </>
    );
}
