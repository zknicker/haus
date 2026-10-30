import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerSummary } from '../servers/contracts.ts';
import { ensureDevelopmentArtifactMessage } from './seed-artifact-message.ts';
import { seedDevelopmentAutomationCauses } from './seed-automation-causes.ts';
import { ensureDevelopmentChatAttachment } from './seed-chat-attachment.ts';
import {
    developmentComputerDataRoot,
    ensureDevelopmentComputerAttachment,
} from './seed-computer-attachment.ts';
import { ensureDevelopmentCove } from './seed-cove.ts';
import { seedDevelopmentHeartbeats } from './seed-heartbeats.ts';
import { seedDevelopmentInboxActivity } from './seed-inbox-activity.ts';
import { seedDevelopmentInboxShowcase } from './seed-inbox-showcase.ts';
import { seedDevelopmentUiGallery } from './seed-ui-gallery.ts';

export interface SeedDevelopmentServerOptions {
    attachmentRoot?: AttachmentRoot;
    computerDataRoot?: string;
    serverOrigin?: string;
}

/** Idempotent seed steps that run on every sign-in, for a fresh or an existing Server. */
export async function ensureDevelopmentSeedSteps(
    db: HausDatabase,
    server: ServerSummary,
    userId: string,
    options: SeedDevelopmentServerOptions
) {
    await ensureDevelopmentCove(db, { serverId: server.id, userId });
    await ensureDevelopmentComputerAttachment(db, server, options);
    if (options.attachmentRoot) {
        await ensureDevelopmentChatAttachment(db, options.attachmentRoot, server.id);
    }
    await ensureDevelopmentArtifactMessage(db, {
        computerDataRoot: developmentComputerDataRoot(options),
        serverId: server.id,
    });
    await seedDevelopmentInboxActivity(db, { serverId: server.id, userId });
    await seedDevelopmentInboxShowcase(db, { serverId: server.id, userId });
    await seedDevelopmentUiGallery(db, { serverId: server.id, userId });
    await seedDevelopmentAutomationCauses(db, { serverId: server.id, userId });
    await seedDevelopmentHeartbeats(db, { serverId: server.id, userId });
}
