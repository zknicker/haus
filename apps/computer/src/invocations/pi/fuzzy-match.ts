export function normalizeForFuzzyMatch(text: string) {
    return text
        .normalize('NFKC')
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .replace(/[\u2018\u2019\u201A\u201B]/gu, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/gu, '"')
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/gu, '-')
        .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/gu, ' ');
}

export function fuzzyFindText(content: string, oldText: string) {
    const exactIndex = content.indexOf(oldText);
    if (exactIndex !== -1) {
        return {
            contentForReplacement: content,
            found: true,
            index: exactIndex,
            matchLength: oldText.length,
            usedFuzzyMatch: false,
        };
    }

    const fuzzyContent = normalizeForFuzzyMatch(content);
    const fuzzyOldText = normalizeForFuzzyMatch(oldText);
    const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText);
    if (fuzzyIndex === -1) {
        return {
            contentForReplacement: content,
            found: false,
            index: -1,
            matchLength: 0,
            usedFuzzyMatch: false,
        };
    }
    return {
        contentForReplacement: fuzzyContent,
        found: true,
        index: fuzzyIndex,
        matchLength: fuzzyOldText.length,
        usedFuzzyMatch: true,
    };
}

export function countOccurrences(content: string, oldText: string) {
    const fuzzyContent = normalizeForFuzzyMatch(content);
    const fuzzyOldText = normalizeForFuzzyMatch(oldText);
    return fuzzyContent.split(fuzzyOldText).length - 1;
}
