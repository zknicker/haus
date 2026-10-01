import { ItemCard } from '@heroui-pro/react';
import { useState } from 'react';
import {
    SettingsCardGrid,
    SettingsCardGridMore,
    SettingsGridCard,
    SettingsGridCheck,
} from '../settings/layout/settings-card-grid.tsx';
import type { HostSkill, HostSkillSection as Section } from './host-skill-catalog.ts';
import { SkillMark } from './skill-mark.tsx';
import { formatSkillName } from './skill-name-format.ts';

const collapsedCount = 6;

/** One section of installed skills, collapsed to its first rows until asked. */
export function HostSkillSection({
    onSelect,
    section,
}: {
    onSelect: (entry: HostSkill) => void;
    section: Section;
}) {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? section.skills : section.skills.slice(0, collapsedCount);
    const hiddenNames = section.skills
        .slice(visible.length)
        .map((entry) => formatSkillName(entry.skill.name));

    return (
        <SettingsCardGrid
            count={section.skills.length}
            footer={
                <SettingsCardGridMore hiddenNames={hiddenNames} onPress={() => setExpanded(true)} />
            }
            title={section.title}
        >
            {visible.map((entry) => (
                <SettingsGridCard key={entry.skill.id} onPress={() => onSelect(entry)}>
                    <ItemCard.Icon>
                        <SkillMark name={entry.skill.name} />
                    </ItemCard.Icon>
                    <ItemCard.Content>
                        <ItemCard.Title>{formatSkillName(entry.skill.name)}</ItemCard.Title>
                        {/* `max-w-full` because the stock description is
                            `width:fit-content`, which a long nowrap line grows
                            past its column instead of ellipsizing. */}
                        <ItemCard.Description className="max-w-full">
                            {entry.skill.description}
                        </ItemCard.Description>
                    </ItemCard.Content>
                    {/* Decorative: the section title already says Installed. */}
                    <SettingsGridCheck />
                </SettingsGridCard>
            ))}
        </SettingsCardGrid>
    );
}
