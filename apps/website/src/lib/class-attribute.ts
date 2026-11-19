export function classAttribute(...classNames: string[]) {
    const required = classNames
        .map((name) => `(?=(?:[^"]*\\s)?${escapeRegExp(name)}[\\s"])`)
        .join('');
    return `class="${required}[^"]*"`;
}

function escapeRegExp(text: string) {
    return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
