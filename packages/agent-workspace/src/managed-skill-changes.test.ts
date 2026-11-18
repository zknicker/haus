import { expect, test } from 'bun:test';
import { defaultVisualsSkill, factoryManagedSkillHashes } from './managed-skills.ts';

test('visuals skill tells agents to tag and rebuild what they derive from it', () => {
    // Derived recipes must name their source so a change notice can find them.
    expect(defaultVisualsSkill).toContain('note that it came from the visuals\nskill');
    expect(defaultVisualsSkill).toContain('rebuild it when the skill changes');
    expect(defaultVisualsSkill).toContain('never save chart geometry as a standing preference');
});

test('each factory-managed skill has one stable content hash', () => {
    const hashes = factoryManagedSkillHashes();
    expect(Object.keys(hashes)).toEqual(['visuals']);
    expect(hashes.visuals).toMatch(/^[0-9a-f]{64}$/u);
    expect(factoryManagedSkillHashes()).toEqual(hashes);
});
