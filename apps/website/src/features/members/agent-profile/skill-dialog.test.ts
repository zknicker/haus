import { expect, test } from 'bun:test';
import { isSkillDirty } from './skill-dialog.tsx';

test('Agent skill save enables only when SKILL.md content changes', () => {
    expect(isSkillDirty('# Skill\n', '# Skill\n')).toBe(false);
    expect(isSkillDirty('# Changed\n', '# Skill\n')).toBe(true);
});
