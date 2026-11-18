import { describe, expect, it } from 'bun:test';
import { buildHostSkillSections } from './host-skill-catalog.ts';

const skill = (name: string) => ({ description: '', id: `hsk_${name}`, name, source: name });

describe('buildHostSkillSections', () => {
    it('collapses one Computer to a single Installed section sorted by display name', () => {
        const sections = buildHostSkillSections([
            {
                health: 'healthy',
                id: 'cmp_a',
                name: 'Studio',
                reportedInventory: {
                    agentSkills: [
                        { agentId: 'agt_1', skills: [agentSkill('zeta')] },
                        { agentId: 'agt_2', skills: [agentSkill('zeta')] },
                    ],
                    importableSkills: [skill('zeta'), skill('alpha')],
                },
            },
        ]);
        expect(sections).toHaveLength(1);
        expect(sections[0]?.title).toBe('Installed');
        expect(sections[0]?.skills.map((entry) => entry.skill.name)).toEqual(['alpha', 'zeta']);
        expect(sections[0]?.skills[1]?.agentIds).toEqual(['agt_1', 'agt_2']);
    });

    it('sections by Computer when several report skills, skipping empty ones', () => {
        const sections = buildHostSkillSections([
            {
                health: 'healthy',
                id: 'cmp_a',
                name: 'Studio',
                reportedInventory: { importableSkills: [skill('alpha')] },
            },
            { health: 'offline', id: 'cmp_b', name: 'Laptop', reportedInventory: null },
            {
                health: 'offline',
                id: 'cmp_c',
                name: null,
                reportedInventory: { importableSkills: [skill('alpha')] },
            },
        ]);
        expect(sections.map((section) => section.title)).toEqual(['Studio', 'Computer']);
    });
});

function agentSkill(name: string) {
    return {
        hash: 'a'.repeat(64),
        description: '',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        name,
    };
}
