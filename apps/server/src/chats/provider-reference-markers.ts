const open = String.fromCodePoint(0xe2_00);
const close = String.fromCodePoint(0xe2_01);
const separator = String.fromCodePoint(0xe2_02);
const markerClass = `[${open}-${separator}]`;
const markerSpan = new RegExp(`${open}[^${open}${close}]*${close}`, 'gu');
const placeholderRun = new RegExp(`${separator}(?:[ \\t]*${separator})+`, 'gu');
const leadingPlaceholder = new RegExp(`^${separator}[ \\t]*`, 'u');
const beforePunctuation = new RegExp(`[ \\t]*${separator}+(?=[.,;:!?)\\]])`, 'gu');
const lineEnd = new RegExp(`[ \\t]*${separator}+[ \\t]*$`, 'gu');
const betweenWords = new RegExp(`([ \\t])${separator}+[ \\t]+`, 'gu');
const strayMarker = new RegExp(markerClass, 'gu');
const anyMarker = new RegExp(markerClass, 'u');

export function stripProviderReferenceMarkers(content: string) {
    if (!anyMarker.test(content)) {
        return content;
    }
    return content
        .split('\n')
        .map((line) => tidyLine(line))
        .join('\n');
}

function tidyLine(line: string) {
    if (!anyMarker.test(line)) {
        return line;
    }
    return line
        .replaceAll(markerSpan, separator)
        .replaceAll(placeholderRun, separator)
        .replace(leadingPlaceholder, '')
        .replaceAll(beforePunctuation, '')
        .replaceAll(lineEnd, '')
        .replaceAll(betweenWords, '$1')
        .replaceAll(strayMarker, '');
}
