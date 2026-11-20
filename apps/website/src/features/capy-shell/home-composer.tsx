import type { Agent, Chat } from '@haus/api';
import { InlineSelect, PromptInput } from '@heroui-pro/react';
import { Label, ListBox } from '@heroui/react';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useHomePromptFocusRequests } from './home-prompt-focus.ts';
import { defaultCaptainId } from './home-send.ts';
import { useHomeSend } from './use-home-send.ts';

type HomeProject = Pick<Chat, 'color' | 'icon' | 'id' | 'name' | 'participantAgentIds'>;
type HomeCaptain = Pick<Agent, 'avatarUrl' | 'displayName' | 'id'>;

export function HomeComposer({
    captains,
    initialProjectId,
    projects,
    serverId,
    slug,
}: {
    captains: readonly HomeCaptain[];
    initialProjectId: string;
    projects: readonly HomeProject[];
    serverId: string;
    slug: string;
}) {
    const sendHome = useHomeSend(serverId, slug);
    const [text, setText] = React.useState('');
    const [projectId, setProjectId] = React.useState(initialProjectId);
    const [pickedCaptainId, setPickedCaptainId] = React.useState<string | null>(null);
    const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
    const focusPrompt = React.useCallback(() => textAreaRef.current?.focus(), []);
    useHomePromptFocusRequests(focusPrompt);

    const project = projects.find((entry) => entry.id === projectId) ?? projects[0];
    const captain = resolveCaptain(captains, project, pickedCaptainId);
    const ask =
        project && captain && text.trim().length > 0
            ? {
                  captain: { agentId: captain.id, name: captain.displayName },
                  projectChatId: project.id,
                  text,
              }
            : null;

    return (
        <div className="flex w-full flex-col gap-2">
            <div className="flex items-center gap-1">
                <ProjectPicker
                    onChange={(id) => {
                        setProjectId(id);
                        setPickedCaptainId(null);
                    }}
                    project={project}
                    projects={projects}
                />
                <CaptainPicker
                    captain={captain}
                    captains={captains}
                    onChange={setPickedCaptainId}
                />
            </div>
            <PromptInput
                size="sm"
                onSubmit={() => {
                    if (ask) {
                        sendHome.send(ask, () => setText(''));
                    }
                }}
                onValueChange={setText}
                status={sendHome.isPending ? 'submitted' : 'ready'}
                value={text}
            >
                <PromptInput.Shell>
                    <PromptInput.Content>
                        <PromptInput.TextArea
                            aria-label="Ask a Captain"
                            autoFocus
                            placeholder={`Ask ${captain?.displayName ?? 'a Captain'} anything`}
                            ref={textAreaRef}
                        />
                    </PromptInput.Content>
                    <PromptInput.Toolbar>
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
            <InlineSelect.Trigger className="gap-1.5">
                {project ? (
                    <ChannelIconBox color={project.color} icon={project.icon} size="inline" />
                ) : null}
                <span className="truncate text-sm">{project?.name ?? 'Project'}</span>
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

function CaptainPicker({
    captain,
    captains,
    onChange,
}: {
    captain: HomeCaptain | undefined;
    captains: readonly HomeCaptain[];
    onChange: (captainId: string) => void;
}) {
    return (
        <InlineSelect
            aria-label="Captain"
            onChange={(next) => {
                if (next !== null) {
                    onChange(String(next));
                }
            }}
            value={captain?.id ?? null}
        >
            <InlineSelect.Trigger className="gap-1.5">
                {captain ? (
                    <EntityAvatar name={captain.displayName} size={18} src={captain.avatarUrl} />
                ) : null}
                <span className="truncate text-sm">{captain?.displayName ?? 'Captain'}</span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-56" placement="bottom start">
                <ListBox>
                    {captains.map((entry) => (
                        <ListBox.Item id={entry.id} key={entry.id} textValue={entry.displayName}>
                            <EntityAvatar
                                name={entry.displayName}
                                size={20}
                                src={entry.avatarUrl}
                            />
                            <Label>{entry.displayName}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

function resolveCaptain(
    captains: readonly HomeCaptain[],
    project: HomeProject | undefined,
    pickedCaptainId: string | null
) {
    const id =
        pickedCaptainId ??
        defaultCaptainId(
            project?.participantAgentIds ?? [],
            captains.map((captain) => captain.id)
        );
    return captains.find((captain) => captain.id === id);
}
