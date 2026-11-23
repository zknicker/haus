import { type GitIdentity, githubBotIdentity } from '@haus/api';
import * as z from 'zod';
import { GithubApiError, githubRequest } from './github-api.ts';
import type { GithubApp } from './github-app.ts';

const botUserSchema = z.object({ id: z.number().int().positive() });

export function createGithubBotIdentity(app: GithubApp) {
    let known: Promise<GitIdentity> | null = null;
    return {
        read() {
            known ??= readBotIdentity(app).catch((cause: unknown) => {
                known = null;
                throw cause;
            });
            return known;
        },
    };
}
export type GithubBotIdentity = ReturnType<typeof createGithubBotIdentity>;

async function readBotIdentity(app: GithubApp) {
    const { slug } = app.config;
    const { body } = await githubRequest(
        { credential: { kind: 'anonymous' }, path: `/users/${encodeURIComponent(`${slug}[bot]`)}` },
        app.transport
    );
    const parsed = botUserSchema.safeParse(body);
    if (!parsed.success) {
        throw new GithubApiError('retryable', null, `GitHub sent an unreadable ${slug}[bot] user.`);
    }
    return githubBotIdentity(slug, parsed.data.id);
}
