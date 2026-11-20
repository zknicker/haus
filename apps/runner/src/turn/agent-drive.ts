import type { SkillListingEntry } from '@haus/agent-prompt';
import { artifactListPageMax } from '@haus/api';
import * as z from 'zod';
import type { RunAuthority } from '../run-context.ts';

const profileSchema = z.object({ profile: z.object({ handle: z.string().min(1) }) });
const artifactSchema = z.object({ artifact_id: z.string().min(1), path: z.string().min(1) });
const byPathSchema = z.object({ artifact: artifactSchema });
const listSchema = z.object({ artifacts: z.array(artifactSchema) });
const downloadSchema = z.object({ download_url: z.string().min(1) });

export class AgentDriveReadError extends Error {
    constructor(what: string, status: number) {
        super(`Reading ${what} from the Server failed with HTTP ${status}.`);
        this.name = 'AgentDriveReadError';
    }
}

export async function readAgentHandle(authority: RunAuthority) {
    return profileSchema.parse(await agentGet(authority, '/api/agent/profile', 'the profile'))
        .profile.handle;
}

export async function readDriveText(authority: RunAuthority, path: string) {
    const found = await agentGet(
        authority,
        `/api/agent/artifacts/by-path?${new URLSearchParams({ path })}`,
        path,
        { missing: true }
    );
    if (found === null) {
        return null;
    }
    return await downloadText(authority, byPathSchema.parse(found).artifact.artifact_id, path);
}

export async function readSkillListing(authority: RunAuthority, handle: string) {
    const root = `agents/${handle}/skills`;
    const query = new URLSearchParams({
        limit: String(artifactListPageMax),
        order: 'path',
        prefix: root,
        recursive: 'true',
    });
    const listed = await agentGet(authority, `/api/agent/artifacts?${query}`, root, {
        missing: true,
    });
    const skillFile = new RegExp(`^${escapeRegExp(root)}/([^/]+)/SKILL\\.md$`, 'u');
    const files = listed === null ? [] : listSchema.parse(listed).artifacts;
    const skills = await Promise.all(
        files.flatMap((file) => {
            const folder = skillFile.exec(file.path)?.[1];
            return folder
                ? [
                      downloadText(authority, file.artifact_id, file.path).then((text) =>
                          skillEntry(folder, text)
                      ),
                  ]
                : [];
        })
    );
    return skills.toSorted((left, right) => left.name.localeCompare(right.name));
}

export function skillEntry(folder: string, text: string) {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text)?.[1] ?? '';
    const field = (name: string) =>
        new RegExp(`^${name}:\\s*(.+)$`, 'mu')
            .exec(frontmatter)?.[1]
            ?.trim()
            .replace(/^(['"])(.*)\1$/u, '$2');
    const entry: SkillListingEntry = {
        description: field('description') ?? '',
        name: field('name') ?? folder,
    };
    return entry;
}

async function downloadText(authority: RunAuthority, artifactId: string, what: string) {
    const download = downloadSchema.parse(
        await agentGet(
            authority,
            `/api/agent/artifacts/${encodeURIComponent(artifactId)}/download`,
            what
        )
    );
    const response = await fetch(download.download_url);
    if (!response.ok) {
        throw new AgentDriveReadError(what, response.status);
    }
    return await response.text();
}

async function agentGet(
    authority: RunAuthority,
    path: string,
    what: string,
    options: { missing?: boolean } = {}
) {
    const response = await fetch(new URL(path, authority.serverUrl), {
        headers: { authorization: `Bearer ${authority.runCredential}` },
    });
    if (options.missing && response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new AgentDriveReadError(what, response.status);
    }
    const body: unknown = await response.json();
    return body;
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
