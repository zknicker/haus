import { parseChatMessageReferenceTarget } from '@haus/api';

import { formatSkillName } from '../skills/skill-name-format.ts';
import { getMentionAppearance } from './mention-appearance.tsx';

export function getMentionDisplayLabel(input: Parameters<typeof getMentionAppearance>[0]) {
    if (
        input.kind === 'chat' &&
        parseChatMessageReferenceTarget(input.id) &&
        input.label.includes(':')
    ) {
        return input.label.split(':')[0] ?? input.label;
    }
    const appearanceLabel = getMentionAppearance(input).label;
    if (appearanceLabel) {
        return appearanceLabel;
    }

    return input.kind === 'skill' ? formatSkillName(input.label) : input.label;
}
