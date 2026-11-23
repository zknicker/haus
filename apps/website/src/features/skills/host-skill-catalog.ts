import type { ComputerInventory, ImportableSkill } from '@haus/api';
import { formatSkillName } from './skill-name-format.ts';

/** One skill installed on a Computer, with the Agents whose library carries it. */
export interface HostSkill {
    agentIds: string[];
    computer: { health: string; id: string; name: string };
    skill: ImportableSkill;
}

export interface HostSkillSection {
    id: string;
    skills: HostSkill[];
    title: string;
}

interface ReportingComputer {
    health: string;
    id: string;
    name: string | null;
    reportedInventory: Pick<ComputerInventory, 'agentSkills' | 'importableSkills'> | null;
}

/**
 * Settings → Skills reads the Computers' reported inventories. One Computer is
 * one "Installed" section; several are one section per Computer, which is
 * also how two same-named skills tell themselves apart.
 */
export function buildHostSkillSections(
    computers: readonly ReportingComputer[]
): HostSkillSection[] {
    const sections = computers
        .map((computer) => ({
            id: computer.id,
            skills: hostSkillsOf(computer),
            title: computer.name ?? 'Device',
        }))
        .filter((section) => section.skills.length > 0);
    if (sections.length === 1) {
        return sections.map((section) => ({ ...section, title: 'Installed' }));
    }
    return sections;
}

export function filterHostSkillSections(
    sections: readonly HostSkillSection[],
    query: string
): HostSkillSection[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return [...sections];
    }
    return sections
        .map((section) => ({
            ...section,
            skills: section.skills.filter(({ skill }) =>
                [formatSkillName(skill.name), skill.name, skill.description].some((text) =>
                    text.toLowerCase().includes(needle)
                )
            ),
        }))
        .filter((section) => section.skills.length > 0);
}

function hostSkillsOf(computer: ReportingComputer): HostSkill[] {
    const inventory = computer.reportedInventory;
    // Agent libraries copy a skill under its own name, so the name is the join.
    const agentIdsBySkillName = new Map<string, string[]>();
    for (const library of inventory?.agentSkills ?? []) {
        for (const skill of library.skills) {
            const agentIds = agentIdsBySkillName.get(skill.name) ?? [];
            agentIds.push(library.agentId);
            agentIdsBySkillName.set(skill.name, agentIds);
        }
    }
    const owner = { health: computer.health, id: computer.id, name: computer.name ?? 'Device' };
    return (inventory?.importableSkills ?? [])
        .map((skill) => ({
            agentIds: agentIdsBySkillName.get(skill.name) ?? [],
            computer: owner,
            skill,
        }))
        .sort((left, right) =>
            formatSkillName(left.skill.name).localeCompare(formatSkillName(right.skill.name))
        );
}
