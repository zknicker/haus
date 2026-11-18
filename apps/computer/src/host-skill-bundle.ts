import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const skillNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

const maxBundleDepth = 8;
const maxBundleFileBytes = 2 * 1024 * 1024;
const maxBundleFiles = 256;
const maxBundleTotalBytes = 8 * 1024 * 1024;

export interface SkillBundleFile {
    content: Uint8Array;
    executable: boolean;
    modifiedAt: number;
    path: string;
}

export async function readSkillBundle(root: string) {
    const files: SkillBundleFile[] = [];
    let totalBytes = 0;
    const walk = async (directory: string, depth: number) => {
        if (depth > maxBundleDepth) {
            throw new Error(`Skill bundles may be at most ${maxBundleDepth} directories deep.`);
        }
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const path = join(directory, entry.name);
            if (entry.isSymbolicLink()) {
                continue;
            }
            if (entry.isDirectory()) {
                await walk(path, depth + 1);
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            const info = await stat(path);
            if (info.size > maxBundleFileBytes) {
                throw new Error(
                    `Skill bundle file "${relative(root, path)}" exceeds ${maxBundleFileBytes} bytes.`
                );
            }
            if (files.length >= maxBundleFiles) {
                throw new Error(`Skill bundles may contain at most ${maxBundleFiles} files.`);
            }
            totalBytes += info.size;
            if (totalBytes > maxBundleTotalBytes) {
                throw new Error(`Skill bundles may contain at most ${maxBundleTotalBytes} bytes.`);
            }
            files.push({
                content: await readFile(path),
                executable: Boolean(info.mode & 0o111),
                modifiedAt: info.mtimeMs,
                path: relative(root, path),
            });
        }
    };
    await walk(root, 0);
    return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function copySkillBundle(files: SkillBundleFile[], destination: string) {
    for (const file of files) {
        const to = join(destination, file.path);
        await mkdir(dirname(to), { mode: 0o700, recursive: true });
        await writeFile(to, file.content, {
            mode: file.executable ? 0o700 : 0o600,
        });
    }
}

export function skillDescription(content: string) {
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1];
    const parsed = frontmatter ? parseFrontmatter(frontmatter) : null;
    const described =
        typeof parsed?.description === 'string'
            ? parsed.description.trim()
            : typeof parsed?.summary === 'string'
              ? parsed.summary.trim()
              : null;
    return (
        described ||
        content
            .split('\n')
            .map((line) => line.replace(/^#+\s*/u, '').trim())
            .find((line) => Boolean(line) && line !== '---') ||
        'Agent skill'
    ).slice(0, 500);
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
    try {
        const parsed: unknown = parseYaml(content);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
