import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { useHostSkillFile } from '../../hooks/skills/use-host-skill-file.ts';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import { useServerContext } from '../servers/server-context.ts';
import type { HostSkill } from './host-skill-catalog.ts';

/**
 * The installed SKILL.md, rendered. Its bytes live only on the Computer, so
 * the preview exists only while that Computer answers; otherwise one quiet
 * line says so. Nothing renders while the read is in flight. Reading it is an
 * Owner/Admin capability, so Members get the same quiet line instead of a
 * request that can only be refused.
 */
export function HostSkillPreview({ entry, serverId }: { entry: HostSkill; serverId: string }) {
    const { role } = useServerContext().server;
    const operator = role === 'owner' || role === 'admin';
    const online = entry.computer.health !== 'offline';
    const file = useHostSkillFile({
        computerId: entry.computer.id,
        serverId,
        sourceId: operator && online ? entry.skill.id : null,
    });

    if (file.data) {
        // One bordered panel that scrolls inside itself, so a long SKILL.md
        // never grows the dialog (`modal__dialog--document` caps the rest).
        return (
            <ItemCardGroup className="max-h-[min(25rem,45vh)] overflow-y-auto" variant="outline">
                <ItemCard>
                    <ItemCard.Content>
                        <ReferenceMarkdown
                            className="chat-markdown text-sm"
                            content={stripFrontmatter(file.data.content)}
                        />
                    </ItemCard.Content>
                </ItemCard>
            </ItemCardGroup>
        );
    }
    if (operator && online && !file.error) {
        return null;
    }
    return (
        <p className="text-muted text-sm">
            {previewUnavailableLine({ computerName: entry.computer.name, online, operator })}
        </p>
    );
}

function previewUnavailableLine(input: {
    computerName: string;
    online: boolean;
    operator: boolean;
}): string {
    if (!input.operator) {
        return 'Preview is available to Server Owners and Admins.';
    }
    return input.online
        ? `${input.computerName} could not read this file.`
        : `Preview is available while ${input.computerName} is online.`;
}

/** Name and description already head the dialog; the YAML block would repeat them. */
export function stripFrontmatter(content: string): string {
    const match = /^---\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/u.exec(content);
    return match ? content.slice(match[0].length).trimStart() : content;
}
