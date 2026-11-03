import type { WebSocket } from 'ws';
import type { ArtifactR2Config, ArtifactStorage } from './artifacts/storage.ts';
import type { AvatarGenerationLogger, AvatarImageProvider } from './avatar-generation/index.ts';
import type { SweepTimers } from './boot-sweep.ts';
import type { ComputerSocketLivenessTiming } from './computers/socket-liveness.ts';
import type { GithubApp } from './github/github-app.ts';
import type { HausReleaseIdentity } from './haus-release-identity.ts';
import type { HostedMcpDefinition } from './hosted-mcp/catalog.ts';
import type { CloudflareAccessOptions } from './identity/cloudflare-access.ts';
import type { ImageProviderAdapters } from './image-generation/run-image-generation.ts';
import type { LinearApp } from './linear/linear-api.ts';
import type { LinearOutboxTransport } from './linear/outbox-calls.ts';
import type { MessageRouter } from './message-routing/jev.ts';
import type { PushSender } from './push/push-sender.ts';
import type { ReminderClock } from './reminders/reminder-model.ts';
import type { ThoughtSummarizer } from './server-agents/agent-thought-summarizer.ts';

/** PostgreSQL- and Cloudflare-authenticated Haus Server HTTP and WebSocket application. */
export interface HausServerApplicationOptions {
    appOrigin: string;
    artifactR2?: ArtifactR2Config;
    artifactStorage?: ArtifactStorage;
    artifactStorageBytes?: number;
    /** Absolute private root for Server-owned attachment bytes. */
    attachmentRoot: string;
    /** Safe operational logger for transient avatar generation. */
    avatarGenerationLogger?: AvatarGenerationLogger;
    /** Testable Server-owned image provider; production uses OpenAI when configured. */
    avatarImageProvider?: AvatarImageProvider;
    /** Cloudflare Access assertion verifier configuration; production uses the Haus Access app. */
    cloudflareAccess?: CloudflareAccessOptions;
    /** Test seam for local Managed OAuth metadata; production discovers Cloudflare metadata. */
    cloudflareOAuthMetadataFetch?: typeof fetch;
    /** Signed latest-production Computer release descriptor. */
    computerReleaseManifestUrl?: string;
    /** Attachment socket ping cadence and silence limit; tests shorten it. */
    computerSocketLiveness?: ComputerSocketLivenessTiming;
    /** Test boundary for the external GPT-Live socket. */
    connectLive?: () => WebSocket;
    /** PostgreSQL database owning Users, Servers, memberships, and Channels. */
    databaseUrl: string;
    /** Enables the fixed, loopback-only local sign-in fixture. */
    enableDevelopmentAuth?: boolean;
    /** The Haus GitHub App; absent or null when its credentials are not configured. */
    githubApp?: GithubApp | null;
    /**
     * How often the GitHub delivery recovery sweep runs. Production sweeps every
     * ten minutes, the development pull every ten seconds; tests pass `null` to
     * skip the background sweep and drive it directly.
     */
    githubRecoveryIntervalMs?: number | null;
    hostedMcps?: { definitions: readonly HostedMcpDefinition[]; storageRoot: string };
    /** Test seam: replaces the OpenAI and Gemini image adapters outright. */
    imageGenerationAdapters?: ImageProviderAdapters;
    /** The Haus Linear app; absent or null when its client id is not configured. */
    linearApp?: LinearApp | null;
    /** Test seam: Linear for the outbox worker. */
    linearOutboxTransport?: LinearOutboxTransport;
    /** `HAUS_LINEAR_URL_SIGNING_KEY`: signs avatar and upload-source URLs; absent disables them. */
    linearUrlSigningKey?: string | null;
    /** The Haus Linear app's webhook secrets, current first; empty answers `503`. */
    linearWebhookSecrets?: readonly string[];
    messageRouter?: MessageRouter;
    /** Server-owned OpenAI key for avatar generation and GPT-Live calls. */
    openAiApiKey?: string;
    /** How long an iPhone push waits for its human to read the message elsewhere; tests shorten it. */
    pushReadGraceMs?: number;
    /** iPhone push (APNs); absent or null when no APNs key is configured. */
    pushSender?: PushSender | null;
    /** Exact identity of the running release; absent for an ordinary development Server. */
    releaseIdentity?: HausReleaseIdentity | null;
    /** Controlled time seam for deterministic reminder and sweep lifecycle tests. */
    reminderClock?: ReminderClock;
    /** Built Haus App assets. Omit only when another process serves the App in development. */
    staticAppRoot?: string;
    /** Interval seam for the boot sweeps; tests pass inert timers. */
    sweepTimers?: SweepTimers;
    /** Gemini summarizer for Agent thought excerpts; without it they are condensed locally. */
    thoughtSummarizer?: ThoughtSummarizer | null;
}
