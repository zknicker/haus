export interface RulesChange {
    readonly content: string | null;
    readonly path: string;
}

export function formatRulesBlock(changes: readonly RulesChange[]) {
    if (changes.length === 0) {
        return null;
    }
    return changes
        .map((change) =>
            [
                '<haus-rules>',
                ...(change.content === null
                    ? [`${change.path} was deleted, so its rules no longer apply.`]
                    : [
                          `The rules in ${change.path}, as they are now. Follow them. Haus puts them here whenever they changed since this session last saw them.`,
                          '',
                          change.content.trimEnd(),
                      ]),
                '</haus-rules>',
            ].join('\n')
        )
        .join('\n\n');
}
