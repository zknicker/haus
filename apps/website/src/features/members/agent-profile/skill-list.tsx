import type { AgentSkillImportRecord, AgentSkillMetadata, ImportableSkill } from '@haus/api';
import { Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import * as React from 'react';
import { PickerPopover } from '../../agents/picker-popover.tsx';
import { SkillMark } from '../../skills/skill-mark.tsx';
import { formatSkillName } from '../../skills/skill-name-format.ts';

/** Agent skill library: the Agent's own SKILL.md copies plus in-flight imports. */
export function SkillList({
    addableSkills,
    canEdit,
    importError,
    importPending,
    imports,
    onImport,
    onSelectSkill,
    skills,
    skillSources,
}: {
    addableSkills: ImportableSkill[];
    canEdit: boolean;
    importError: string | null;
    importPending: boolean;
    imports: AgentSkillImportRecord[];
    onImport: (sourceId: string) => void;
    onSelectSkill: (skill: AgentSkillMetadata) => void;
    skills: AgentSkillMetadata[];
    skillSources: ImportableSkill[];
}) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header className="flex items-center justify-between gap-3">
                <ItemCardGroup.Title>
                    Skills
                    <span className="ms-2 text-muted tabular-nums">{skills.length}</span>
                </ItemCardGroup.Title>
                {canEdit ? (
                    <PickerPopover
                        emptyText="Every available skill is already added."
                        isPending={importPending}
                        items={addableSkills.map((skill) => ({
                            id: skill.id,
                            name: formatSkillName(skill.name),
                        }))}
                        label="Add Skills"
                        onAdd={(skill) => onImport(skill.id)}
                        searchPlaceholder="Search skills..."
                    />
                ) : null}
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {skills.length === 0 ? (
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Description>No skills yet.</ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                ) : (
                    skills.map((skill, index) => (
                        <React.Fragment key={skill.name}>
                            {index > 0 ? <Separator /> : null}
                            <ItemCard>
                                <ItemCard.Icon>
                                    <SkillMark name={skill.name} />
                                </ItemCard.Icon>
                                <ItemCard.Content>
                                    {/* The pretty name everywhere a human reads it —
                                        the Add picker already formats, so raw kebab
                                        names here read as two different products. */}
                                    <ItemCard.Title>
                                        {canEdit ? (
                                            <button
                                                className="cursor-(--cursor-interactive) rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
                                                onClick={() => onSelectSkill(skill)}
                                                type="button"
                                            >
                                                {formatSkillName(skill.name)}
                                            </button>
                                        ) : (
                                            formatSkillName(skill.name)
                                        )}
                                    </ItemCard.Title>
                                    {/* One truncating line, so every row keeps one
                                        height — full descriptions wrapped to three
                                        lines and made the list read as uneven
                                        blocks; the whole text lives in the skill
                                        dialog. `max-w-full` because the stock
                                        description is `width:fit-content`, which a
                                        long nowrap line grows past its column,
                                        painting under the action instead of
                                        ellipsizing. */}
                                    <ItemCard.Description className="max-w-full">
                                        {skill.description}
                                    </ItemCard.Description>
                                </ItemCard.Content>
                            </ItemCard>
                        </React.Fragment>
                    ))
                )}
            </ItemCardGroup>
            {importError ? <p className="px-4 text-danger text-sm">{importError}</p> : null}
            {imports.map((record) => {
                const sourceName = skillSources.find(
                    (candidate) => candidate.id === record.sourceId
                )?.name;
                return (
                    <p
                        className={
                            record.status === 'failed'
                                ? 'px-4 text-danger text-sm'
                                : 'px-4 text-muted text-sm'
                        }
                        key={record.requestId}
                    >
                        {record.status === 'failed'
                            ? `${formatSkillName(sourceName ?? 'Skill')} import failed: ${record.error}`
                            : `Importing ${formatSkillName(sourceName ?? 'skill')}…`}
                    </p>
                );
            })}
        </ItemCardGroup>
    );
}
