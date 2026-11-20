import { parseHausRichReferences, parseSkillReferenceTarget } from '@haus/api/rich-references';

export const runtimeSkillLoading = 'Use the normal runtime skill-loading mechanism for them:';

export const runnerSkillLoading = 'Open each one with `haus skill view <name>` before you start:';

export function projectMessageForAgent(input: {
    content: string;
    enabledSkillIds: readonly string[];
    loading?: string;
}) {
    const skillIds = resolveActiveReferencedSkillIds(input);
    if (skillIds.length === 0) {
        return input.content;
    }

    return [
        '<skill_reference_context>',
        `The user explicitly referenced these enabled skills for this turn. ${input.loading ?? runtimeSkillLoading}`,
        '',
        ...skillIds.map((skillId) => `- ${skillId}`),
        '</skill_reference_context>',
        '',
        input.content,
    ]
        .join('\n')
        .trim();
}

function resolveActiveReferencedSkillIds(input: {
    content: string;
    enabledSkillIds: readonly string[];
}) {
    const enabledSkillIds = new Set(input.enabledSkillIds);
    const seen = new Set<string>();
    const skillIds: string[] = [];

    for (const reference of parseHausRichReferences(input.content)) {
        if (reference.kind !== 'skill' || reference.projection !== 'skill-activation') {
            continue;
        }

        const skillId = parseSkillReferenceTarget(reference.id);
        if (!(skillId && enabledSkillIds.has(skillId)) || seen.has(skillId)) {
            continue;
        }

        seen.add(skillId);
        skillIds.push(skillId);
    }

    return skillIds;
}
