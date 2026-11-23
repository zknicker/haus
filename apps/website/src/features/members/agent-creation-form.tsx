import { AGENT_DESCRIPTION_MAX_LENGTH, type Agent, type AgentReasoningEffort } from '@haus/api';
import {
    Alert,
    Button,
    Description,
    Form,
    Input,
    Label,
    Modal,
    TextArea,
    TextField,
} from '@heroui/react';
import * as React from 'react';
import { AvatarPicker } from '../avatars/avatar-picker.tsx';
import type { AvatarImage } from '../avatars/resize-avatar-image.ts';
import { ProjectSelect } from '../chats/project-select.tsx';
import type { AgentCreationSubmitValues, ReportedComputer } from './agent-creation-contract.ts';
import { resolveAgentCreationDefaults } from './agent-creation-defaults.ts';
import { createAgentHandle } from './agent-handle.ts';
import { agentModelKey, agentModelOptions } from './agent-model-options.ts';
import { AgentModelPicker } from './agent-model-picker.tsx';
import { InventorySelect } from './inventory-select.tsx';
import { ReasoningSelect, supportedReasoningEffort } from './reasoning-select.tsx';
import { SignatureEmojiField } from './signature-emoji-field.tsx';

export type { AgentCreationSubmitValues, ReportedComputer } from './agent-creation-contract.ts';

interface AgentCreationFormProps {
    agents: readonly Agent[];
    error: { message: string } | null;
    isPending: boolean;
    onAddDevice?: () => void;
    onCreated: (agentId: string) => void;
    onSubmit: (values: AgentCreationSubmitValues) => Promise<{ agentId: string }>;
    reported: ReportedComputer[];
    serverId: string;
}

export function AgentCreationForm({
    agents,
    error,
    isPending,
    onAddDevice,
    onCreated,
    onSubmit,
    reported,
    serverId,
}: AgentCreationFormProps) {
    const defaults = React.useMemo(
        () => resolveAgentCreationDefaults(reported, agents),
        [agents, reported]
    );
    const defaultsKey = JSON.stringify(defaults);
    const initializedKey = React.useRef<string | null>(null);
    const [computerId, setComputerId] = React.useState(defaults.computerId);
    const [runtimeId, setRuntimeId] = React.useState(defaults.runtimeId);
    const [modelId, setModelId] = React.useState(defaults.modelId);
    const [reasoningEffort, setReasoningEffort] = React.useState<AgentReasoningEffort>(
        defaults.reasoningEffort
    );
    const [displayName, setDisplayName] = React.useState('');
    const [homeProjectId, setHomeProjectId] = React.useState<string | null>(null);
    const [description, setDescription] = React.useState('');
    const [signatureEmoji, setSignatureEmoji] = React.useState<string | null>(null);
    const [avatar, setAvatar] = React.useState<AvatarImage | null>(null);
    const [avatarError, setAvatarError] = React.useState<string | null>(null);
    const formId = React.useId();

    React.useEffect(() => {
        if (initializedKey.current === defaultsKey) {
            return;
        }
        initializedKey.current = defaultsKey;
        setComputerId(defaults.computerId);
        setRuntimeId(defaults.runtimeId);
        setModelId(defaults.modelId);
        setReasoningEffort(defaults.reasoningEffort);
        setDisplayName('');
        setHomeProjectId(null);
        setDescription('');
        setSignatureEmoji(null);
        setAvatar(null);
        setAvatarError(null);
    }, [defaults, defaultsKey]);

    const computer = reported.find((entry) => entry.id === computerId) ?? reported[0];
    const runtimes = computer?.inventory.runtimes ?? [];
    const runtime = runtimes.find((entry) => entry.id === runtimeId) ?? runtimes[0];
    const models = runtime?.models ?? [];
    const model = models.find((entry) => entry.id === modelId) ?? models[0];
    const name = displayName.trim();
    const canSubmit =
        [name, homeProjectId, computer, runtime, model].every(Boolean) &&
        !isPending &&
        !avatarError;
    const avatarSrc = avatar?.dataUrl ?? null;

    const handleSubmit = React.useEffectEvent(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!(canSubmit && homeProjectId && computer && runtime && model)) {
            return;
        }

        try {
            const result = await onSubmit({
                ...(avatar
                    ? {
                          avatar: {
                              bytesBase64: avatar.base64,
                              mediaType: avatar.mediaType,
                          },
                      }
                    : {}),
                computerId: computer.id,
                description: description.trim() || null,
                displayName: name,
                handle: createAgentHandle(name, agents),
                homeProjectId,
                modelId: model.id,
                reasoningEffort: supportedReasoningEffort(model, reasoningEffort),
                runtimeId: runtime.id,
                signatureEmoji,
            });
            onCreated(result.agentId);
        } catch {
            // The mutation owns the visible error. Keeping the form mounted is
            // what makes a stale-action or validation refusal recoverable.
        }
    });

    return (
        <>
            <Modal.Body>
                <Form className="grid gap-4" id={formId} onSubmit={handleSubmit}>
                    <div className="flex items-center gap-3">
                        <AvatarPicker
                            label="avatar"
                            name={name || 'New Captain'}
                            onError={setAvatarError}
                            onSelect={setAvatar}
                            size={72}
                            src={avatarSrc}
                        />
                        <div className="min-w-0">
                            <p className="text-sm font-medium">Captain avatar</p>
                            <p className="text-muted text-sm">
                                {avatar
                                    ? 'New image selected.'
                                    : 'Optional — initials stand in until you choose one.'}
                            </p>
                        </div>
                    </div>
                    <InventorySelect
                        description={
                            reported.length === 0
                                ? 'Connect a device in Settings → Devices to create a Captain.'
                                : undefined
                        }
                        disabled={reported.length === 0}
                        label="Device"
                        onChange={(nextId) => {
                            const next = reported.find((entry) => entry.id === nextId);
                            const firstRuntime = next?.inventory.runtimes[0];
                            setComputerId(nextId);
                            setRuntimeId(firstRuntime?.id ?? '');
                            setModelId(firstRuntime?.models[0]?.id ?? '');
                        }}
                        options={reported}
                        placeholder={
                            reported.length === 0 ? 'No devices available' : 'Select a device'
                        }
                        value={computer?.id ?? ''}
                    />
                    {reported.length === 0 && onAddDevice ? (
                        <Button onPress={onAddDevice} size="sm" variant="secondary">
                            Add a device
                        </Button>
                    ) : null}
                    <TextField
                        fullWidth
                        onChange={setDisplayName}
                        value={displayName}
                        variant="secondary"
                    >
                        <Label>Name</Label>
                        <Input autoFocus maxLength={80} placeholder="e.g. Alice" />
                    </TextField>
                    <ProjectSelect
                        fullWidth
                        onSelect={setHomeProjectId}
                        serverId={serverId}
                        value={homeProjectId}
                    >
                        <Label>Project</Label>
                    </ProjectSelect>
                    <TextField
                        fullWidth
                        onChange={setDescription}
                        value={description}
                        variant="secondary"
                    >
                        <Label>Description</Label>
                        <TextArea
                            maxLength={AGENT_DESCRIPTION_MAX_LENGTH}
                            placeholder="Leave blank for a general-purpose Captain, or describe a role…"
                            rows={4}
                        />
                        <Description>Optional</Description>
                    </TextField>
                    <SignatureEmojiField onChange={setSignatureEmoji} value={signatureEmoji} />
                    <AgentModelPicker
                        onPick={(option) => {
                            setRuntimeId(option.runtimeId);
                            setModelId(option.model.id);
                        }}
                        options={agentModelOptions(runtimes, null)}
                        selectedKey={agentModelKey(runtime?.id ?? '', model?.id ?? '')}
                    />
                    <ReasoningSelect
                        model={model}
                        onChange={setReasoningEffort}
                        value={supportedReasoningEffort(model, reasoningEffort)}
                    />
                    {avatarError || error ? (
                        <Alert status="danger">
                            <Alert.Indicator />
                            <Alert.Content>
                                <Alert.Description>
                                    {avatarError ?? error?.message}
                                </Alert.Description>
                            </Alert.Content>
                        </Alert>
                    ) : null}
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button form={formId} isDisabled={!canSubmit} isPending={isPending} type="submit">
                    Create Captain
                </Button>
            </Modal.Footer>
        </>
    );
}
