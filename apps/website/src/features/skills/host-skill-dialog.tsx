import { AvatarGroup, Button, Disclosure, Modal, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import type React from 'react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { SettingsFact } from '../settings/layout/settings-text.tsx';
import type { HostSkill } from './host-skill-catalog.ts';
import { HostSkillPreview } from './host-skill-preview.tsx';
import { SkillMark } from './skill-mark.tsx';
import { formatSkillName } from './skill-name-format.ts';

/** Enough of an Agent to name it and draw its mark. */
export interface SkillAgent {
    avatarUrl: string | null;
    name: string;
}

/**
 * One installed skill, read like a product page: its mark and name, what it
 * does, and its SKILL.md. Where it lives sits behind Details, and who uses it
 * is one line beside Done — neither earns a section of its own.
 */
export function HostSkillDialog({
    agents,
    entry,
    onClose,
    serverId,
}: {
    agents: ReadonlyMap<string, SkillAgent>;
    entry: HostSkill | null;
    onClose: () => void;
    serverId: string;
}) {
    return (
        <Modal.Backdrop
            isDismissable
            isOpen={entry !== null}
            onOpenChange={(open) => (open ? undefined : onClose())}
        >
            {/* `inside` caps the dialog and scrolls the body, so a short
                window never pushes the header and Done out of reach. */}
            <Modal.Container scroll="inside" size="lg">
                <Modal.Dialog className="modal__dialog--document">
                    {entry ? (
                        <>
                            <Modal.CloseTrigger />
                            <Modal.Header>
                                <Modal.Icon className="modal__icon--product">
                                    <SkillMark name={entry.skill.name} />
                                </Modal.Icon>
                                <Modal.Heading>
                                    {formatSkillName(entry.skill.name)}
                                    <span className="ms-2 font-normal text-muted">Skill</span>
                                </Modal.Heading>
                            </Modal.Header>
                            <Modal.Body>
                                <div className="flex flex-col gap-4">
                                    {entry.skill.description ? (
                                        <p className="text-base text-foreground">
                                            {entry.skill.description}
                                        </p>
                                    ) : null}
                                    <HostSkillPreview entry={entry} serverId={serverId} />
                                    <HostSkillDetails entry={entry} />
                                </div>
                            </Modal.Body>
                            <Modal.Footer>
                                <HostSkillUsedBy agentIds={entry.agentIds} agents={agents} />
                                <Button slot="close" variant="secondary">
                                    Done
                                </Button>
                            </Modal.Footer>
                        </>
                    ) : null}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

/** Where the skill lives — collapsed, because it is rarely what you came for. */
function HostSkillDetails({ entry }: { entry: HostSkill }) {
    return (
        <Disclosure>
            <Disclosure.Heading>
                <Button size="sm" slot="trigger" variant="ghost">
                    Details
                    <Disclosure.Indicator />
                </Button>
            </Disclosure.Heading>
            <Disclosure.Content>
                <ItemCardGroup className="mt-2" variant="outline">
                    <HostSkillFact label="Source">
                        <SettingsFact
                            className="block truncate text-right font-mono"
                            title={entry.skill.source}
                        >
                            {entry.skill.source}
                        </SettingsFact>
                    </HostSkillFact>
                    <Separator />
                    <HostSkillFact label="Computer">
                        <SettingsFact className="block truncate">
                            {entry.computer.name}
                        </SettingsFact>
                    </HostSkillFact>
                </ItemCardGroup>
            </Disclosure.Content>
        </Disclosure>
    );
}

function HostSkillFact({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <ItemCard>
            <ItemCard.Content className="shrink-0 basis-auto">
                <ItemCard.Title>{label}</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action className="min-w-0 shrink">{children}</ItemCard.Action>
        </ItemCard>
    );
}

const usedByAvatarCount = 3;

/** Agents whose own library carries a skill of this name, as one footer line. */
function HostSkillUsedBy({
    agentIds,
    agents,
}: {
    agentIds: readonly string[];
    agents: ReadonlyMap<string, SkillAgent>;
}) {
    const users = agentIds.flatMap((id) => {
        const agent = agents.get(id);
        return agent ? [{ id, ...agent }] : [];
    });

    // `me-auto` holds the line at the footer's leading edge, across from Done.
    return (
        <p className="me-auto flex min-w-0 items-center gap-2 text-muted text-sm">
            {users.length > 0 ? (
                <>
                    <AvatarGroup aria-hidden="true" size="sm">
                        {users.slice(0, usedByAvatarCount).map((agent) => (
                            <EntityAvatar
                                key={agent.id}
                                name={agent.name}
                                size={20}
                                src={agent.avatarUrl}
                            />
                        ))}
                    </AvatarGroup>
                    <span className="truncate">
                        Used by {usedByLabel(users.map((a) => a.name))}
                    </span>
                </>
            ) : (
                'Not used by any Agent yet'
            )}
        </p>
    );
}

export function usedByLabel(names: readonly string[]): string {
    const [first, second] = names;
    if (names.length <= 1) {
        return first ?? '';
    }
    if (names.length === 2) {
        return `${first} and ${second}`;
    }
    return `${first}, ${second}, and ${names.length - 2} more`;
}
