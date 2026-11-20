import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OperationContext } from './operation.ts';

type PathContext = Pick<OperationContext, 'cwd' | 'env'>;

const unicodeSpaces = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/gu;
const narrowNoBreakSpace = '\u202F';

export function resolveMachinePath(path: string, context: PathContext) {
    const expanded = expandPath(path, context.env.HOME ?? homedir());
    return isAbsolute(expanded) ? resolve(expanded) : resolve(context.cwd, expanded);
}

export async function resolveReadPath(path: string, context: PathContext) {
    const resolved = resolveMachinePath(path, context);
    if (await pathExists(resolved)) {
        return resolved;
    }
    const nfd = resolved.normalize('NFD');
    const variants = [
        resolved.replace(/ (AM|PM)\./giu, `${narrowNoBreakSpace}$1.`),
        nfd,
        curlyQuoteVariant(resolved),
        curlyQuoteVariant(nfd),
    ];
    for (const variant of variants) {
        if (variant !== resolved && (await pathExists(variant))) {
            return variant;
        }
    }
    return resolved;
}

function expandPath(path: string, home: string) {
    let normalized = path.replace(unicodeSpaces, ' ');
    if (normalized.startsWith('@')) {
        normalized = normalized.slice(1);
    }
    if (normalized === '~') {
        return home;
    }
    if (normalized.startsWith('~/')) {
        return join(home, normalized.slice(2));
    }
    if (normalized.startsWith('file://')) {
        return fileURLToPath(normalized);
    }
    return normalized;
}

function curlyQuoteVariant(path: string) {
    return path.replaceAll("'", '\u2019');
}

async function pathExists(path: string) {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}
