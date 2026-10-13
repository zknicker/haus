import { artifactPublishResultSchema } from '@haus/api';
import { AgentCliError } from '../agent-error.ts';

export async function readArtifactPublishReceipt(
    response: Response,
    requestId: string
): Promise<unknown> {
    if (!response.ok) {
        if (response.status >= 500) {
            throw unconfirmedPublish(requestId);
        }
        let detail = '';
        try {
            detail = await response.text();
        } catch {
            throw unconfirmedPublish(requestId);
        }
        throw new AgentCliError(
            'ARTIFACT_PUBLISH_FAILED',
            `Publishing failed (${response.status}): ${detail}`
        );
    }
    try {
        return artifactPublishResultSchema.parse(await response.json());
    } catch {
        throw unconfirmedPublish(requestId);
    }
}

export function unconfirmedPublish(requestId: string): AgentCliError {
    return new AgentCliError(
        'ARTIFACT_PUBLISH_UNCONFIRMED',
        `Publishing may have succeeded, but the response could not be read. Request ID: ${requestId}.`,
        {
            nextAction: `Retry this same file and metadata with --request-id ${requestId}. Do not publish again without that id.`,
            retryable: true,
        }
    );
}
