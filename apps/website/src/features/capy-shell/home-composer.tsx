import type { Chat } from '@haus/api';
import { InlineSelect, PromptInput } from '@heroui-pro/react';
import { Label, ListBox } from '@heroui/react';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { useHomePromptFocusRequests } from './home-prompt-focus.ts';
import {
    HomeMachinePicker,
    HomeModelPicker,
    useHomeMachines,
    useHomeModels,
} from './home-session-pickers.tsx';
import { useHomeSend } from './use-home-send.ts';

type HomeProject = Pick<Chat, 'color' | 'icon' | 'id' | 'name'>;

export function HomeComposer({
    initialProjectId,
    projects,
    serverId,
    slug,
}: {
    initialProjectId: string;
    projects: readonly HomeProject[];
    serverId: string;
    slug: string;
}) {
    const sendHome = useHomeSend(slug);
    const [text, setText] = React.useState('');
    const [projectId, setProjectId] = React.useState(initialProjectId);
    const [machineId, setMachineId] = React.useState<null | string>(null);
    const [modelId, setModelId] = React.useState<null | string>(null);
    const [requestId, setRequestId] = React.useState(() => crypto.randomUUID());
    const composerRef = React.useRef<HTMLDivElement>(null);
    const focusPrompt = React.useCallback(
        () =>
            composerRef.current
                ?.querySelector<HTMLTextAreaElement>('[data-slot="prompt-input-textarea"]')
                ?.focus(),
        []
    );
    useHomePromptFocusRequests(focusPrompt);

    const project = projects.find((entry) => entry.id === projectId) ?? projects[0];
    const { fallback: projectMachine, machines } = useHomeMachines(serverId, project?.id);
    const { fallback: firstModel, models } = useHomeModels(serverId);
    const machine = machines.find((entry) => entry.id === machineId) ?? projectMachine;
    const model = models.find((entry) => entry.id === modelId) ?? firstModel;
    const ask =
        project && machine && model && text.trim().length > 0 && !sendHome.isPending
            ? {
                  computerId: machine.id,
                  model: model.id,
                  projectChatId: project.id,
                  requestId,
                  serverId,
                  text,
              }
            : null;

    return (
        <div className="home-composer flex w-full flex-col gap-2" ref={composerRef}>
            <div className="flex items-center gap-1">
                <ProjectPicker onChange={setProjectId} project={project} projects={projects} />
            </div>
            <PromptInput
                size="sm"
                onSubmit={() => {
                    if (ask) {
                        sendHome.send(ask, () => {
                            setText('');
                            setRequestId(crypto.randomUUID());
                        });
                    }
                }}
                onValueChange={setText}
                status={sendHome.isPending ? 'submitted' : 'ready'}
                value={text}
            >
                <PromptInput.Shell>
                    <PromptInput.Content>
                        <PromptInput.TextArea
                            aria-label="Start a Task"
                            autoFocus
                            placeholder="Start a Task"
                        />
                    </PromptInput.Content>
                    <PromptInput.Toolbar
                        onClick={(event) => {
                            if (event.target === event.currentTarget) {
                                focusPrompt();
                            }
                        }}
                    >
                        <PromptInput.ToolbarStart>
                            <HomeMachinePicker
                                machine={machine}
                                machines={machines}
                                onChange={setMachineId}
                            />
                            <HomeModelPicker model={model} models={models} onChange={setModelId} />
                        </PromptInput.ToolbarStart>
                        <PromptInput.ToolbarEnd>
                            <PromptInput.Send aria-label="Send" isDisabled={!ask} />
                        </PromptInput.ToolbarEnd>
                    </PromptInput.Toolbar>
                </PromptInput.Shell>
            </PromptInput>
            {sendHome.error ? <p className="text-danger text-sm">{sendHome.error}</p> : null}
        </div>
    );
}

function ProjectPicker({
    onChange,
    project,
    projects,
}: {
    onChange: (projectId: string) => void;
    project: HomeProject | undefined;
    projects: readonly HomeProject[];
}) {
    return (
        <InlineSelect
            aria-label="Project"
            onChange={(next) => {
                if (next !== null) {
                    onChange(String(next));
                }
            }}
            value={project?.id ?? null}
        >
            <InlineSelect.Trigger>
                {project ? (
                    <ChannelIconBox color={project.color} icon={project.icon} size="inline" />
                ) : null}
                <InlineSelect.Value>{() => project?.name ?? 'Project'}</InlineSelect.Value>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-64" placement="bottom start">
                <ListBox>
                    {projects.map((entry) => (
                        <ListBox.Item id={entry.id} key={entry.id} textValue={entry.name ?? ''}>
                            <ChannelIconBox color={entry.color} icon={entry.icon} size="inline" />
                            <Label>{entry.name}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </InlineSelect.Popover>
        </InlineSelect>
    );
}
