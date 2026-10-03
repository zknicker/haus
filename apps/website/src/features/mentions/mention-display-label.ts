import { parseChatThreadReferenceTarget } from '@haus/api';
import { formatSkillName } from '../skills/skill-name-format.ts';
import { getMentionAppearance } from './mention-appearance.tsx';

export function getMentionDisplayLabel(input: Parameters<typeof getMentionAppearance>[0]) {
    if (
        input.kind === 'chat' &&
        parseChatThreadReferenceTarget(input.id) &&
        input.label.includes(':')
    ) {
        return `${input.label.split(':')[0]} thread`;
    }
    const appearanceLabel = getMentionAppearance(input).label;
    if (appearanceLabel) {
        return appearanceLabel;
    }

    return input.kind === 'skill' ? formatSkillName(input.label) : input.label;
}
