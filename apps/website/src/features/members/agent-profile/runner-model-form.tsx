import {
    type Agent,
    type ComputerInventory,
    type ModelConnection,
    reasoningChangeResetsSession,
} from '@haus/api';
import { Button, Description, Form, Modal } from '@heroui/react';
import { CpuIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';
import { agentConnectionChoice } from '../agent-model-connection-model.ts';
import { AgentModelDetail } from '../agent-model-detail.tsx';
import { agentModelKey, agentModelOptions } from '../agent-model-options.ts';
import { AgentModelPicker } from '../agent-model-picker.tsx';
import { supportedReasoningEffort } from '../reasoning-select.tsx';
import { isRuntimeConfigDraftAvailable, type RuntimeConfigDraft } from './runtime-model.ts';

type Runtime = ComputerInventory['runtimes'][number];

export function RunnerModelForm({
    agent,
    connections,
    error,
    onSave,
    pending,
    runtimes,
}: {
    agent: Agent;
    connections: ModelConnection[];
    error: string | null;
    onSave: (draft: RuntimeConfigDraft) => Promise<void>;
    pending: boolean;
    runtimes: Runtime[];
}) {
    const options = agentModelOptions(runtimes, connections);
    const [selectedKey, setSelectedKey] = React.useState(
        agentModelKey(agent.desiredRuntimeId, agent.desiredModelId)
    );
    const [preferredEffort, setPreferredEffort] = React.useState(agent.desiredReasoningEffort);
    const selected = options.find((option) => option.key === selectedKey) ?? null;
    const reasoningEffort = supportedReasoningEffort(selected?.model, preferredEffort);
    const draft = {
        modelId: selected?.model.id ?? agent.desiredModelId,
        reasoningEffort,
        runtimeId: selected?.runtimeId ?? agent.desiredRuntimeId,
    };
    const canSave =
        Boolean(selected?.connected) && isRuntimeConfigDraftAvailable(draft, runtimes) && !pending;
    const connection = selected ? chosenConnection(agent, selected.model.id, connections) : null;

    return (
        <>
            <Modal.Header>
                <Modal.Icon className="modal__icon--neutral">
                    <Icon className="size-5" icon={CpuIcon} />
                </Modal.Icon>
                <Modal.Heading>Model</Modal.Heading>
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
                    <AgentModelPicker
                        onPick={(option) => setSelectedKey(option.key)}
                        options={options}
                        selectedKey={selectedKey}
                    />
                    {selected ? (
                        <AgentModelDetail
                            connection={connection}
                            onReasoningChange={setPreferredEffort}
                            option={selected}
                            reasoningEffort={reasoningEffort}
                        />
                    ) : null}
                    <Description className="text-base">
                        Changes apply on the next turn. Changing the model starts a fresh session
                        and keeps your workspace, memory, and chat history.
                        {reasoningChangeResetsSession(draft.runtimeId)
                            ? ' Grok also starts a fresh session when reasoning effort changes.'
                            : null}
                    </Description>
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

function chosenConnection(agent: Agent, modelId: string, connections: ModelConnection[]) {
    const choice = agentConnectionChoice(
        { desiredModelId: modelId, modelConnectionId: agent.modelConnectionId },
        connections
    );
    if (choice.kind === 'none') {
        return null;
    }
    return (
        choice.options.find((option) => option.id === choice.selectedKey) ??
        choice.options.find((option) => option.enabled) ??
        null
    );
}
