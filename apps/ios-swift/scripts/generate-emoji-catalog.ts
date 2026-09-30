/**
 * Emits the bundled emoji catalog for the iPhone reaction picker.
 *
 * Two pinned MIT datasets by the same author, built to pair:
 * `unicode-emoji-json` carries Unicode's order, groups, CLDR names, emoji
 * versions, and skin-tone support; `emojilib` carries the search keywords
 * ("dino" finds 🦖, whose name is only "T-Rex"). Bump both versions together,
 * rerun, and commit the JSON.
 *
 *   bun apps/ios-swift/scripts/generate-emoji-catalog.ts
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const unicodeEmojiJSON = 'unicode-emoji-json@0.9.0';
const emojilib = 'emojilib@4.0.3';

const iosRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(iosRoot, 'Sources/HausUI/Resources/emoji-catalog.json');

interface SourceEmoji {
    emoji: string;
    emoji_version: string;
    name: string;
    skin_tone_support: boolean;
}

interface SourceGroup {
    emojis: SourceEmoji[];
    name: string;
}

const workDir = mkdtempSync(join(tmpdir(), 'emoji-catalog-'));
try {
    const groups = JSON.parse(
        readFileSync(join(unpack(unicodeEmojiJSON), 'data-by-group.json'), 'utf8')
    ) as SourceGroup[];
    const keywords = JSON.parse(
        readFileSync(join(unpack(emojilib), 'dist/emoji-en-US.json'), 'utf8')
    ) as Record<string, string[]>;

    const catalog = {
        source: `${unicodeEmojiJSON} + ${emojilib}, MIT`,
        groups: groups.map((group) => ({
            name: group.name,
            // [emoji, name, emoji version, skin tones (1/0), extra keywords]
            emoji: group.emojis.map((entry) => [
                entry.emoji,
                entry.name,
                entry.emoji_version,
                entry.skin_tone_support ? 1 : 0,
                extraKeywords(entry.name, keywords[entry.emoji] ?? []),
            ]),
        })),
    };
    writeFileSync(outputPath, `${JSON.stringify(catalog)}\n`);
    const count = catalog.groups.reduce((sum, group) => sum + group.emoji.length, 0);
    console.log(`Wrote ${count} emoji in ${catalog.groups.length} groups to ${outputPath}`);
} finally {
    rmSync(workDir, { force: true, recursive: true });
}

function unpack(spec: string): string {
    const pack = Bun.spawnSync(['npm', 'pack', spec, '--silent'], { cwd: workDir });
    if (pack.exitCode !== 0) {
        throw new Error(`npm pack ${spec} failed: ${pack.stderr.toString()}`);
    }
    const tarball = pack.stdout.toString().trim();
    const target = join(workDir, spec.replace(/[@/]/g, '_'));
    Bun.spawnSync(['mkdir', '-p', target]);
    const untar = Bun.spawnSync(['tar', 'xzf', join(workDir, tarball), '-C', target]);
    if (untar.exitCode !== 0) {
        throw new Error(`Unpacking ${tarball} failed: ${untar.stderr.toString()}`);
    }
    return join(target, 'package');
}

/** Keywords the name does not already say, as one space-separated string. */
function extraKeywords(name: string, words: string[]): string {
    const named = new Set(words.length > 0 ? tokens(name) : []);
    const extra = new Set<string>();
    for (const word of words.flatMap(tokens)) {
        if (!named.has(word)) {
            extra.add(word);
        }
    }
    return [...extra].join(' ');
}

function tokens(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 0);
}
