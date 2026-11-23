import type { Chat } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Description, Dropdown, Label, Modal, Separator } from '@heroui/react';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useAgentHomeMove } from '../../hooks/projects/use-agent-home-move.ts';
import { useProjects } from '../../hooks/projects/use-projects.ts';
import { projectCaptains } from '../../lib/project-homes.ts';
import { SettingsEmptyRow } from '../settings/layout/settings-empty.tsx';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';
import { ProjectSelect } from './project-select.tsx';

export function ProjectCaptainsDialog({ chat, onClose }: { chat: Chat; onClose: () => void }) {
    const projects = useProjects(chat.serverId);
    const agents = useAgents(chat.serverId);
    const move = useAgentHomeMove();
    const { candidates, captains } = projectCaptains(
        projects.data ?? [],
        agents.data ?? [],
        chat.id
    );
    const loaded = projects.data !== undefined && agents.data !== undefined;
    const moveHome = (agentId: string, projectId: string) =>
        move.mutate({ agentId, projectId, serverId: chat.serverId });

    return (
        <Modal.Backdrop isDismissable isOpen onOpenChange={(open) => !open && onClose()}>
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Icon>
                            <ChannelIconBox color={chat.color} icon={chat.icon} size="modal" />
                        </Modal.Icon>
                        <Modal.Heading>Captains in #{chat.name}</Modal.Heading>
                        <p>Captains hear the Project they live in and start their Tasks there.</p>
                    </Modal.Header>
                    <Modal.Body>
                        <ItemCardGroup variant="transparent">
                            <ItemCardGroup.Header>
                                <ItemCardGroup.Title>Captains</ItemCardGroup.Title>
                                <Dropdown>
                                    <Button
                                        isDisabled={!loaded || candidates.length === 0}
                                        size="sm"
                                        variant="secondary"
                                    >
                                        Add
                                    </Button>
                                    <Dropdown.Popover placement="bottom end">
                                        <Dropdown.Menu
                                            onAction={(agentId) =>
                                                moveHome(String(agentId), chat.id)
                                            }
                                        >
                                            {candidates.map(({ agent, home }) => (
                                                <Dropdown.Item
                                                    id={agent.id}
                                                    key={agent.id}
                                                    textValue={agent.displayName}
                                                >
                                                    <EntityAvatar
                                                        name={agent.displayName}
                                                        size="sm"
                                                        src={agent.avatarUrl}
                                                    />
                                                    <div className="flex flex-col">
                                                        <Label>{agent.displayName}</Label>
                                                        <Description>
                                                            Lives in #{home.name}
                                                        </Description>
                                                    </div>
                                                </Dropdown.Item>
                                            ))}
                                        </Dropdown.Menu>
                                    </Dropdown.Popover>
                                </Dropdown>
                            </ItemCardGroup.Header>
                            <ItemCardGroup variant="outline">
                                {loaded && captains.length === 0 ? (
                                    <SettingsEmptyRow>No Captains live here.</SettingsEmptyRow>
                                ) : null}
                                {captains.map((agent, index) => (
                                    <React.Fragment key={agent.id}>
                                        {index > 0 ? <Separator /> : null}
                                        <ItemCard>
                                            <EntityAvatar
                                                name={agent.displayName}
                                                size="sm"
                                                src={agent.avatarUrl}
                                            />
                                            <ItemCard.Content>
                                                <ItemCard.Title>{agent.displayName}</ItemCard.Title>
                                                <ItemCard.Description>
                                                    @{agent.handle}
                                                </ItemCard.Description>
                                            </ItemCard.Content>
                                            <ItemCard.Action>
                                                <ProjectSelect
                                                    aria-label={`Move ${agent.displayName} to`}
                                                    className="w-44"
                                                    except={chat.id}
                                                    isDisabled={move.isPending}
                                                    onSelect={(projectId) =>
                                                        moveHome(agent.id, projectId)
                                                    }
                                                    placeholder="Move to…"
                                                    serverId={chat.serverId}
                                                    value={null}
                                                />
                                            </ItemCard.Action>
                                        </ItemCard>
                                    </React.Fragment>
                                ))}
                            </ItemCardGroup>
                        </ItemCardGroup>
                        <SettingsRowError>
                            {move.error?.message ??
                                projects.error?.message ??
                                agents.error?.message}
                        </SettingsRowError>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button slot="close" type="button" variant="secondary">
                            Done
                        </Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}
