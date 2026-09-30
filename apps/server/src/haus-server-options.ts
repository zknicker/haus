import type { WebSocket } from 'ws';
import type { AvatarGenerationLogger, AvatarImageProvider } from './avatar-generation/index.ts';
import type { SweepTimers } from './boot-sweep.ts';
import type { HausReleaseIdentity } from './haus-release-identity.ts';
import type { ClerkUsers } from './identity/clerk-users.ts';
import type { MessageRouter } from './message-routing/jev.ts';
import type { PushSender } from './push/push-sender.ts';
import type { ReminderClock } from './reminders/reminder-model.ts';
import type { ThoughtSummarizer } from './server-agents/agent-thought-summarizer.ts';

/** PostgreSQL- and Clerk-backed Haus Server HTTP and WebSocket application. */
export interface HausServerApplicationOptions {
    appOrigin: string;
    /** Absolute private root for Server-owned attachment bytes. */
    attachmentRoot: string;
    /** Safe operational logger for transient avatar generation. */
    avatarGenerationLogger?: AvatarGenerationLogger;
    /** Testable Server-owned image provider; production uses OpenAI when configured. */
    avatarImageProvider?: AvatarImageProvider;
    /** Clerk Backend API origin; defaults to Clerk's production endpoint. */
    clerkApiUrl?: string;
    /** Origin of the Clerk instance that authenticates humans. */
    clerkIssuerUrl: string;
    /** Clerk secret for the verified-email lookup invitations depend on. */
    clerkSecretKey?: string;
    /** Overrides the Clerk verified-email boundary; tests stand in for it. */
    clerkUsers?: ClerkUsers;
    /** Signed latest-production Computer release descriptor. */
    computerReleaseManifestUrl?: string;
    /** Test boundary for the external GPT-Live socket. */
    connectLive?: () => WebSocket;
    /** PostgreSQL database owning Users, Servers, memberships, and Channels. */
    databaseUrl: string;
    messageRouter?: MessageRouter;
    /** Server-owned OpenAI key for avatar generation and GPT-Live calls. */
    openAiApiKey?: string;
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
