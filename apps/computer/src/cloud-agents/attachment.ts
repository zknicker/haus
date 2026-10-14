import { attachmentCredentialHash } from '../attachment-daemon-process.ts';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import type { Attachment } from '../launch.ts';
import { configureClaudeCloudComputer } from './registry.ts';
import { CloudAgentWorkSupervisor } from './work-runner.ts';

/** One attachment binds cloud access and monitoring to the same Computer credential. */
export function createAttachmentCloudAgents(
    runtime: DaemonRuntime,
    input: {
        dataRoot: string;
        attachment: Pick<Attachment, 'serverId' | 'serverOrigin' | 'credential'>;
    }
): CloudAgentWorkSupervisor {
    const { dataRoot, attachment } = input;
    configureClaudeCloudComputer({
        dataRoot,
        serverId: attachment.serverId,
        serverOrigin: attachment.serverOrigin,
        credentialHash: attachmentCredentialHash(attachment.credential),
    });
    return new CloudAgentWorkSupervisor(runtime, { dataRoot, serverId: attachment.serverId });
}
