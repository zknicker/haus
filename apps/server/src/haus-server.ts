import { DeterministicAvatarImageProvider } from './avatar-generation/deterministic-provider.ts';
import { env } from './config/env.ts';
import { readHausReleaseIdentity } from './haus-release-identity.ts';
import {
    createHausServerApplication,
    type HausServerApplication,
} from './haus-server-application.ts';
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
    const application = await createHausServerApplication({
        appOrigin: env.HAUS_APP_ORIGIN,
        attachmentRoot: env.HAUS_ATTACHMENT_ROOT,
        clerkApiUrl: env.HAUS_CLERK_API_URL,
        clerkIssuerUrl: env.HAUS_CLERK_ISSUER_URL,
        clerkSecretKey: env.HAUS_CLERK_SECRET_KEY,
        computerReleaseManifestUrl: env.HAUS_COMPUTER_RELEASE_MANIFEST_URL,
        databaseUrl: env.HAUS_DATABASE_URL,
        avatarImageProvider: createAvatarImageProvider(),
        openAiApiKey: env.HAUS_OPENAI_API_KEY,
        messageRouter: env.HAUS_TYPESAFE_API_KEY
            ? createJevRouter(env.HAUS_TYPESAFE_API_KEY)
            : undefined,
        pushSender: push.sender,
        releaseIdentity: release,
        staticAppRoot: env.HAUS_STATIC_APP_ROOT,
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
    logStartupDetail('🔑', 'Clerk', env.HAUS_CLERK_ISSUER_URL);
    logStartupDetail(
        '✉️',
        'Invitations',
        env.HAUS_CLERK_SECRET_KEY
            ? 'verified-email lookup configured'
            : 'disabled — set HAUS_CLERK_SECRET_KEY to accept invitations'
    );
    logStartupDetail(
        '💭',
        'Agent thoughts',
        env.HAUS_GEMINI_API_KEY
            ? 'Gemini summaries'
            : 'local condensation — set HAUS_GEMINI_API_KEY for Gemini summaries'
    );
    logStartupEvent('📱', push.status, push.sender ? 'success' : 'warning');
    logStartupDetail('🌐', 'Haus App origin', env.HAUS_APP_ORIGIN);
    logStartupDetail('📡', 'HTTP', `http://127.0.0.1:${env.HAUS_SERVER_PORT}`);
    logStartupDetail('🔌', 'WebSocket', `ws://127.0.0.1:${env.HAUS_SERVER_PORT}/trpc`);
    logStartupComplete('Haus Server is ready');
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
    process.once('SIGTERM', () => {
        void application.close().catch((error) => {
            console.error('[haus] failed to close the Haus Server', error);
        });
    });
}

start().catch((error) => {
    logStartupFailure('Haus Server boot failed');
    console.error(error);
    process.exitCode = 1;
});
