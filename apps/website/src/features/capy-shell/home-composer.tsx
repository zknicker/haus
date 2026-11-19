import type { Agent, Chat } from '@haus/api';
import { InlineSelect, PromptInput } from '@heroui-pro/react';
import { Label, ListBox } from '@heroui/react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useChatMessageSend } from '../../hooks/servers/use-chat-message-send.ts';
import { serverChatRoute } from '../servers/server-routes.ts';
import { useHomePromptFocusRequests } from './home-prompt-focus.ts';
import { defaultCaptainId, planHomeSend, sendHomeAsk } from './home-send.ts';

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
    const navigate = useNavigate();
    const send = useChatMessageSend();
    const [text, setText] = React.useState('');
    const [projectId, setProjectId] = React.useState(initialProjectId);
    const [pickedCaptainId, setPickedCaptainId] = React.useState<string | null>(null);
    const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
    const focusPrompt = React.useCallback(() => textAreaRef.current?.focus(), []);
    useHomePromptFocusRequests(focusPrompt);

    const project = projects.find((entry) => entry.id === projectId) ?? projects[0];
    const captainId =
        pickedCaptainId ??
        defaultCaptainId(
            project?.participantAgentIds ?? [],
            captains.map((captain) => captain.id)
        );
    const captain = captains.find((entry) => entry.id === captainId);
    const plan =
        project && captain
            ? planHomeSend({
                  captain: { agentId: captain.id, name: captain.displayName },
                  projectChatId: project.id,
                  text,
              })
            : null;

    const submit = () => {
        if (!plan) {
            return;
        }
        setText('');
        navigate(serverChatRoute(slug, plan.chatId));
        void sendHomeAsk({ plan, send, serverId });
    };

    return (
        <div className="flex w-full flex-col gap-2">
            <div className="flex items-center gap-1">
                <InlineSelect
                    aria-label="Project"
                    onChange={(next) => {
                        if (next !== null) {
                            setProjectId(String(next));
                            setPickedCaptainId(null);
                        }
                    }}
                    value={project?.id ?? null}
                >
                    <InlineSelect.Trigger className="gap-1.5">
                        {project ? (
                            <ChannelIconBox
                                color={project.color}
                                icon={project.icon}
                                size="inline"
                            />
                        ) : null}
                        <span className="truncate text-sm">{project?.name ?? 'Project'}</span>
                        <InlineSelect.Indicator />
                    </InlineSelect.Trigger>
                    <InlineSelect.Popover className="w-56" placement="bottom start">
                        <ListBox>
                            {projects.map((entry) => (
                                <ListBox.Item
                                    id={entry.id}
                                    key={entry.id}
                                    textValue={entry.name ?? ''}
                                >
                                    <ChannelIconBox
                                        color={entry.color}
                                        icon={entry.icon}
                                        size="inline"
                                    />
                                    <Label>{entry.name}</Label>
                                    <ListBox.ItemIndicator />
                                </ListBox.Item>
                            ))}
                        </ListBox>
                    </InlineSelect.Popover>
                </InlineSelect>
                <InlineSelect
                    aria-label="Captain"
                    onChange={(next) => {
                        if (next !== null) {
                            setPickedCaptainId(String(next));
                        }
                    }}
                    value={captain?.id ?? null}
                >
                    <InlineSelect.Trigger className="gap-1.5">
                        {captain ? (
                            <EntityAvatar
                                name={captain.displayName}
                                size={18}
                                src={captain.avatarUrl}
                            />
                        ) : null}
                        <span className="truncate text-sm">
                            {captain?.displayName ?? 'Captain'}
                        </span>
                        <InlineSelect.Indicator />
                    </InlineSelect.Trigger>
                    <InlineSelect.Popover className="w-56" placement="bottom start">
                        <ListBox>
                            {captains.map((entry) => (
                                <ListBox.Item
                                    id={entry.id}
                                    key={entry.id}
                                    textValue={entry.displayName}
                                >
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
            </div>
            <PromptInput onSubmit={submit} onValueChange={setText} value={text}>
                <PromptInput.Shell>
                    <PromptInput.Content>
                        <PromptInput.TextArea
                            aria-label="Ask a Captain"
                            autoFocus
                            placeholder={
                                captain
                                    ? `What should ${captain.displayName} work on?`
                                    : 'What should we work on?'
                            }
                            ref={textAreaRef}
                        />
                    </PromptInput.Content>
                    <PromptInput.Toolbar>
                        <PromptInput.ToolbarEnd>
                            <PromptInput.Send aria-label="Send" isDisabled={!plan} />
                        </PromptInput.ToolbarEnd>
                    </PromptInput.Toolbar>
                </PromptInput.Shell>
            </PromptInput>
        </div>
    );
}
