import { describe, expect, it } from 'bun:test';
import { formatSkillName } from './skill-name-format.ts';

describe('formatSkillName', () => {
    it('prettifies kebab and snake case names', () => {
        expect(formatSkillName('image-gen')).toBe('Image Gen');
        expect(formatSkillName('skill_creator')).toBe('Skill Creator');
    });

    it('uppercases known acronyms', () => {
        expect(formatSkillName('pdf-tools')).toBe('PDF Tools');
        expect(formatSkillName('github-mcp')).toBe('GitHub MCP');
    });

    it('collapses redundant qualified prefixes', () => {
        expect(formatSkillName('memory:memory')).toBe('Memory');
        expect(formatSkillName('team:custom-skill')).toBe('Team:custom Skill');
    });
});
