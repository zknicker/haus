import { artifactPathKey } from '@haus/api';

export function untitledFileName(taken: Iterable<string>) {
    const names = new Set([...taken].map(artifactPathKey));
    let name = 'untitled.md';
    for (let index = 2; names.has(artifactPathKey(name)); index += 1) {
        name = `untitled-${index}.md`;
    }
    return name;
}
