import type { z } from 'zod';
import type { agentCloudAgentStartResponseSchema } from './agent-api-schemas.ts';
import { formatHistoryLine, shortMessageId } from './agent-format.ts';
import { isThreadTarget } from './agent-render.ts';

type CloudAgentStartResponse = z.infer<typeof agentCloudAgentStartResponseSchema>;

export function renderCloudAgentStart(
    response: CloudAgentStartResponse,
    request: { repository: string; startingRef: string | null; target: string }
): string {
    return response.state === 'held'
        ? renderHeld(request.target, response)
        : renderStarted(response, request);
}

function renderStarted(
    receipt: Extract<CloudAgentStartResponse, { state: 'started' }>,
    request: { repository: string; startingRef: string | null }
): string {
    const ref = request.startingRef ? `@${request.startingRef}` : '';
    const lines = [
        `Cloud agent started for ${request.repository}${ref}. Work ID: ${receipt.work.id}`,
        `Posted to ${receipt.target}. Message ID: ${receipt.messageId}`,
        isThreadTarget(receipt.target)
            ? `Work thread: "${receipt.target}".`
            : `Work thread: "${receipt.target}:${shortMessageId(receipt.messageId)}".`,
        'The result reaches your inbox when the run settles; post what you learn yourself.',
    ];
    return `${lines.join('\n')}\n`;
}

/** Mirrors the `haus message send` hold so the Agent reads the same shape. */
function renderHeld(
    target: string,
    response: Extract<CloudAgentStartResponse, { state: 'held' }>
): string {
    const shown = response.shownMessages.length;
    const lines = [
        `Freshness hold: showing latest ${shown} of ${response.newMessageCount} newer messages.`,
    ];
    if (response.omittedMessageCount > 0) {
        lines.push(
            `${response.omittedMessageCount} earlier newer messages were omitted. Use haus message read --target "${target}" to review them.`
        );
    }
    lines.push(
        'The cloud agent was not started: no card was posted and nothing was launched. Review this context.'
    );
    if (response.formalMentionCount > 0) {
        lines.push(
            `You were formally mentioned in ${response.formalMentionCount} of these newer messages.`
        );
    }
    lines.push(
        '',
        ...response.shownMessages.map(formatHistoryLine),
        '',
        `If the launch still belongs in ${target}, run the same haus cloud-agent start command again. If the newer messages change where or whether it belongs, launch it there or skip it.`
    );
    return `${lines.join('\n')}\n`;
}
