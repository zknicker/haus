import { describe, expect, test } from 'bun:test';
import { projectMessageForAgent, runnerSkillLoading } from './rich-reference-projection.ts';

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

    test('names the exact Computer and runner wording around the referenced skills', () => {
        const content = 'Use [$agent-browser](skill://agent-browser).';
        const block = (loading: string) =>
            [
                '<skill_reference_context>',
                `The user explicitly referenced these enabled skills for this turn. ${loading}`,
                '',
                '- agent-browser',
                '</skill_reference_context>',
                '',
                content,
            ].join('\n');
        expect(projectMessageForAgent({ content, enabledSkillIds: ['agent-browser'] })).toBe(
            block('Use the normal runtime skill-loading mechanism for them:')
        );
        expect(
            projectMessageForAgent({
                content,
                enabledSkillIds: ['agent-browser'],
                loading: runnerSkillLoading,
            })
        ).toBe(block('Open each one with `haus skill view <name>` before you start:'));
    });
});
