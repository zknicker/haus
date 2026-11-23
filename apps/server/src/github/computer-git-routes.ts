import {
    computerGitCredentialPath,
    computerGitCredentialRequestSchema,
    computerGitIdentityPath,
} from '@haus/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
    ComputerSetupDeniedError,
    hashComputerSecret,
    resolveComputerCredential,
} from '../computers/service.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createGithubBotIdentity } from './bot-identity.ts';
import { issueComputerGitCredential } from './computer-git-credential.ts';
import type { GithubApp } from './github-app.ts';
import { createScopedInstallationTokens } from './installation-tokens.ts';

export function registerComputerGitRoutes(
    app: FastifyInstance,
    options: { db: HausDatabase; githubApp: GithubApp | null }
) {
    const { db, githubApp } = options;
    const tokens = githubApp ? createScopedInstallationTokens(githubApp) : null;
    const identity = githubApp ? createGithubBotIdentity(githubApp) : null;

    app.get(computerGitIdentityPath, async (request, reply) => {
        const computer = await authorizeComputer(db, request, reply);
        if (!computer) {
            return reply;
        }
        if (!identity) {
            return unavailable(reply);
        }
        return reply.header('cache-control', 'no-store').send(await identity.read());
    });

    app.post(computerGitCredentialPath, async (request, reply) => {
        const computer = await authorizeComputer(db, request, reply);
        if (!computer) {
            return reply;
        }
        const parsed = computerGitCredentialRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: 'The git credential request was invalid.' });
        }
        if (!tokens) {
            return unavailable(reply);
        }
        const answer = await issueComputerGitCredential(db, tokens, computer, parsed.data);
        if (answer.kind === 'refused') {
            return reply.code(403).send({ code: answer.code, error: answer.message });
        }
        return reply.header('cache-control', 'no-store').send(answer.credential);
    });
}

async function authorizeComputer(db: HausDatabase, request: FastifyRequest, reply: FastifyReply) {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        await reply.code(401).send({ error: 'A Computer credential is required.' });
        return null;
    }
    try {
        return await resolveComputerCredential(db, hashComputerSecret(header.slice(7)));
    } catch (cause) {
        if (cause instanceof ComputerSetupDeniedError) {
            await reply.code(401).send({ error: cause.message });
            return null;
        }
        throw cause;
    }
}

function unavailable(reply: FastifyReply) {
    return reply.code(503).send({
        code: 'github_app_unavailable',
        error: 'This Server has no Haus GitHub App configured.',
    });
}
