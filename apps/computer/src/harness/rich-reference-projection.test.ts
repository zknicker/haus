import { describe, expect, test } from 'bun:test';
import { projectMessageForAgent } from './rich-reference-projection.ts';

describe('projectMessageForAgent', () => {
    test('activates a referenced local skill while preserving canonical markdown', () => {
        const content = 'Please use [$agent-browser](skill://agent-browser) for this turn.';
        const projected = projectMessageForAgent({
            content,
            enabledSkillIds: ['agent-browser'],
        });

        expect(projected).toContain('<skill_reference_context>');
        expect(projected).toContain('- agent-browser');
        expect(projected).toContain(content);
    });

    test('does not activate a skill absent from the addressed Agent library', () => {
        const content = 'Please use [$agent-browser](skill://agent-browser) for this turn.';

        expect(
            projectMessageForAgent({
                content,
                enabledSkillIds: ['different-skill'],
            })
        ).toBe(content);
    });
});
