import { parseHausRichReferences, parseUserReferenceTarget } from '@haus/api';

export function mentionedUserIds(content: string): string[] {
    return [
        ...new Set(
            parseHausRichReferences(content).flatMap((reference) => {
                if (reference.kind !== 'user') {
                    return [];
                }
                const userId = parseUserReferenceTarget(reference.id);
                return userId ? [userId] : [];
            })
        ),
    ];
}
