import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeterministicAvatarImageProvider } from './avatar-generation/deterministic-provider.ts';
import { env } from './config/env.ts';
import { githubAppFromEnvironment } from './github/github-app.ts';
import { readHausReleaseIdentity } from './haus-release-identity.ts';
import {
    createHausServerApplication,
    type HausServerApplication,
} from './haus-server-application.ts';
import { handleStopSignals } from './haus-server-stop.ts';
import { linearHostedDefinition, skoolHostedDefinition } from './hosted-mcp/catalog.ts';
import { cloudflareAccessIssuer } from './identity/cloudflare-access.ts';
import { linearAppFromEnvironment } from './linear/linear-api.ts';
import { createJevRouter } from './message-routing/jev-client.ts';
import { describeDatabaseUrl } from './postgres/database-url.ts';
import { createPushSender } from './push/push-configuration.ts';
import { createGeminiThoughtSummarizer } from './server-agents/agent-thought-summarizer.ts';
import {
    logStartupBanner,
    logStartupComplete,
    logStartupDetail,
    logStartupEvent,
    logStartupFailure,
    logStartupSection,
} from './startup-log.ts';

async function start() {
    logStartupBanner('🟠 Haus Server', 'Booting the Haus Server');
    const release = env.HAUS_RELEASE_MANIFEST
        ? readHausReleaseIdentity(env.HAUS_RELEASE_MANIFEST)
        : null;

    const push = await createPushSender({
        keyId: env.HAUS_APNS_KEY_ID,
        privateKey: env.HAUS_APNS_PRIVATE_KEY,
        teamId: env.APPLE_TEAM_ID,
    });
    const githubApp = await githubAppFromEnvironment(env);
    const application = await createHausServerApplication({
        appOrigin: env.HAUS_APP_ORIGIN,
        artifactR2:
            env.HAUS_ENABLE_ARTIFACT_STORAGE &&
            env.HAUS_ARTIFACT_R2_ENDPOINT &&
            env.HAUS_ARTIFACT_R2_BUCKET &&
            env.HAUS_ARTIFACT_R2_ACCESS_KEY_ID &&
            env.HAUS_ARTIFACT_R2_SECRET_ACCESS_KEY
                ? {
                      endpoint: env.HAUS_ARTIFACT_R2_ENDPOINT,
                      bucket: env.HAUS_ARTIFACT_R2_BUCKET,
                      accessKeyId: env.HAUS_ARTIFACT_R2_ACCESS_KEY_ID,
                      secretAccessKey: env.HAUS_ARTIFACT_R2_SECRET_ACCESS_KEY,
                      sessionToken: env.HAUS_ARTIFACT_R2_SESSION_TOKEN,
                      maxBytes: env.HAUS_ARTIFACT_MAX_BYTES,
                  }
                : undefined,
        artifactStorageBytes: env.HAUS_ARTIFACT_STORAGE_BYTES,
        attachmentRoot: env.HAUS_ATTACHMENT_ROOT,
        cloudflareAccess: { audience: env.HAUS_CF_ACCESS_AUDIENCE },
        computerReleaseManifestUrl: env.HAUS_COMPUTER_RELEASE_MANIFEST_URL,
        databaseUrl: env.HAUS_DATABASE_URL,
        hostedMcps: {
            definitions: [
                skoolHostedDefinition(hostedMcpPackageRoot('skool', release !== null)),
                linearHostedDefinition(hostedMcpPackageRoot('linear', release !== null)),
            ],
            storageRoot: join(env.HAUS_ATTACHMENT_ROOT, '.hosted-mcp'),
        },
        avatarImageProvider: createAvatarImageProvider(),
        githubApp,
        githubRecoveryIntervalMs: githubRecoveryInterval(),
        linearApp: linearAppFromEnvironment(env),
        linearUrlSigningKey: env.HAUS_LINEAR_URL_SIGNING_KEY ?? null,
        // The previous secret is honored only beside a current one.
        linearWebhookSecrets: env.HAUS_LINEAR_APP_WEBHOOK_SECRET
            ? [
                  env.HAUS_LINEAR_APP_WEBHOOK_SECRET,
                  ...(env.HAUS_LINEAR_APP_WEBHOOK_SECRET_PREVIOUS
                      ? [env.HAUS_LINEAR_APP_WEBHOOK_SECRET_PREVIOUS]
                      : []),
              ]
            : [],
        openAiApiKey: env.HAUS_OPENAI_API_KEY,
        messageRouter: env.HAUS_TYPESAFE_API_KEY
            ? createJevRouter(env.HAUS_TYPESAFE_API_KEY)
            : undefined,
        pushSender: push.sender,
        releaseIdentity: release,
        staticAppRoot: env.HAUS_STATIC_APP_ROOT,
        enableDevelopmentAuth: process.env.HAUS_DEV_STACK === '1',
        thoughtSummarizer: env.HAUS_GEMINI_API_KEY
            ? createGeminiThoughtSummarizer({ apiKey: env.HAUS_GEMINI_API_KEY })
            : null,
    });

    await application.listen(env.HAUS_SERVER_PORT);

    registerShutdown(application);

    logStartupSection('Haus Server');
    if (release) {
        logStartupDetail('🏷️', 'Product', release.productVersion);
        logStartupDetail('📦', 'Server', release.serverVersion);
        logStartupDetail('🧭', 'Revision', release.sourceRevision);
        logStartupDetail('🔒', 'Digest', release.contentDigest);
    }
    logStartupDetail('🐘', 'PostgreSQL', describeDatabaseUrl(env.HAUS_DATABASE_URL));
    logStartupDetail('📎', 'Attachments', env.HAUS_ATTACHMENT_ROOT);
    logStartupDetail('🔗', 'Hosted MCPs', 'Skool ready · private transport · supervised by Server');
    logStartupDetail('🔑', 'Cloudflare Access', cloudflareAccessIssuer);
    logStartupDetail('✉️', 'Invitations', 'verified-email aliases stored in Haus');
    logStartupDetail(
        '💭',
        'Agent thoughts',
        env.HAUS_GEMINI_API_KEY
            ? 'Gemini summaries'
            : 'local condensation — set HAUS_GEMINI_API_KEY for Gemini summaries'
    );
    logStartupEvent('📱', push.status, push.sender ? 'success' : 'warning');
    logStartupDetail(
        '🐙',
        'GitHub App',
        githubApp
            ? `${githubApp.config.slug} — delivery recovery every ${githubRecoveryInterval() / 1000}s`
            : 'disabled — set the HAUS_GITHUB_APP_* values to enable GitHub'
    );
    logStartupDetail('🌐', 'Haus App origin', env.HAUS_APP_ORIGIN);
    logStartupDetail('📡', 'HTTP', `http://127.0.0.1:${env.HAUS_SERVER_PORT}`);
    logStartupDetail('🔌', 'WebSocket', `ws://127.0.0.1:${env.HAUS_SERVER_PORT}/trpc`);
    logStartupComplete('Haus Server is ready');
}

/**
 * A development stack has no public webhook URL: the dev App posts to the
 * Haus sink, and every stack pulls the App's delivery log instead
 * (specs/github-triggers.md#recovery-and-the-development-pull).
 */
function githubRecoveryInterval() {
    return process.env.HAUS_DEV_STACK === '1' ? 10_000 : 10 * 60_000;
}

/**
 * Where a connector package lives: beside the release manifest in a release,
 * or where the dev stack packages it (`scripts/dev-stack-server-environment.mjs`).
 */
function hostedMcpPackageRoot(id: 'linear' | 'skool', release: boolean): string {
    return release
        ? join(dirname(env.HAUS_RELEASE_MANIFEST ?? ''), `share/haus-server/hosted-mcp/${id}`)
        : fileURLToPath(new URL(`../../../.context/hosted-mcp/${id}/`, import.meta.url));
}

function createAvatarImageProvider() {
    if (process.env.HAUS_DEV_STACK !== '1' || env.HAUS_AGENT_E2E_AVATAR_FIXTURE !== '1') {
        return undefined;
    }
    if (!env.HAUS_AGENT_E2E_AVATAR_FIXTURE_PATH) {
        throw new Error(
            'HAUS_AGENT_E2E_AVATAR_FIXTURE_PATH is required when the local avatar fixture is enabled.'
        );
    }
    return new DeterministicAvatarImageProvider(
        env.HAUS_AGENT_E2E_AVATAR_FIXTURE_PATH,
        env.HAUS_AGENT_E2E_AVATAR_REQUEST_LOG
    );
}

function registerShutdown(application: HausServerApplication) {
    handleStopSignals(process, {
        close: () => application.close(),
        exit: (code) => process.exit(code),
        log: (line) => console.log(line),
        reportFailure: (error) => {
            console.error('[haus] failed to close the Haus Server', error);
        },
    });
}

start().catch((error) => {
    logStartupFailure('Haus Server boot failed');
    console.error(error);
    process.exitCode = 1;
});
