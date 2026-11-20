import type { Chat } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Description, Dropdown, Label, Modal, Separator } from '@heroui/react';
import * as React from 'react';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useAgentHomeMove } from '../../hooks/projects/use-agent-home-move.ts';
import { useProjects } from '../../hooks/projects/use-projects.ts';
import { hausProject, projectCaptains } from '../../lib/project-homes.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';

export function ProjectCaptainsDialog({ chat, onClose }: { chat: Chat; onClose: () => void }) {
    const projects = useProjects(chat.serverId);
    const agents = useAgents(chat.serverId);
    const move = useAgentHomeMove();
    const { candidates, captains } = projectCaptains(
        projects.data ?? [],
        agents.data ?? [],
        chat.id
    );
    const haus = hausProject(projects.data ?? []);
    const loaded = projects.data !== undefined && agents.data !== undefined;
    const moveHome = (agentId: string, projectId: string) =>
        move.mutate({ agentId, projectId, serverId: chat.serverId });

    return (
        <Modal.Backdrop isDismissable isOpen onOpenChange={(open) => !open && onClose()}>
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>Captains in #{chat.name}</Modal.Heading>
                        <p className="text-muted text-sm leading-5">
                            Captains hear the Project they live in and start their Tasks there.
                        </p>
                    </Modal.Header>
                    <Modal.Body>
                        <ItemCardGroup variant="transparent">
                            <ItemCardGroup.Header className="flex items-center justify-between gap-3">
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
                                                    <Label>{agent.displayName}</Label>
                                                    <Description>Lives in #{home.name}</Description>
                                                </Dropdown.Item>
                                            ))}
                                        </Dropdown.Menu>
                                    </Dropdown.Popover>
                                </Dropdown>
                            </ItemCardGroup.Header>
                            <ItemCardGroup variant="outline">
                                {loaded && captains.length === 0 ? (
                                    <ItemCard>
                                        <ItemCard.Content>
                                            <ItemCard.Description>
                                                No Captains live here.
                                            </ItemCard.Description>
                                        </ItemCard.Content>
                                    </ItemCard>
                                ) : null}
                                {captains.map((agent, index) => (
                                    <React.Fragment key={agent.id}>
                                        {index > 0 ? <Separator /> : null}
                                        <ItemCard>
                                            <ItemCard.Content>
                                                <ItemCard.Title>{agent.displayName}</ItemCard.Title>
                                                <ItemCard.Description>
                                                    @{agent.handle}
                                                </ItemCard.Description>
                                            </ItemCard.Content>
                                            {haus && !chat.isAll ? (
                                                <ItemCard.Action>
                                                    <Button
                                                        isDisabled={move.isPending}
                                                        onPress={() =>
                                                            moveHome(agent.id, haus.chatId)
                                                        }
                                                        size="sm"
                                                        variant="secondary"
                                                    >
                                                        Send to #{haus.name}
                                                    </Button>
                                                </ItemCard.Action>
                                            ) : null}
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
