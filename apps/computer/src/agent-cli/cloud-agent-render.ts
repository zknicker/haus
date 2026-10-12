import { formatCloudAgentWorkLink } from '@haus/api';
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

/** `haus cloud-agent inspect` without `--work`: one line per work, each with its link. */
export function renderCloudAgentWorkList(works: readonly CloudAgentWorkLinkSource[]): string {
    if (works.length === 0) {
        return 'No cloud agent work found.\n';
    }
    const rows = works.map(
        (work) =>
            `${work.id} [${work.status}] ${work.title} (${work.repository})\n  Link: ${formatCloudAgentWorkLink(work.title, work.id)}`
    );
    return `${rows.join('\n')}\n${linkSentence}\n`;
}

/** `haus cloud-agent inspect --work <id>`: the recorded work, then its link. */
export function renderCloudAgentWorkDetail(works: readonly CloudAgentWorkLinkSource[]): string {
    const links = works.map((work) => `Link: ${formatCloudAgentWorkLink(work.title, work.id)}`);
    return `${JSON.stringify(works, null, 2)}\n${links.length ? `${[...links, linkSentence].join('\n')}\n` : ''}`;
}

interface CloudAgentWorkLinkSource {
    id: string;
    repository: string;
    status: string;
    title: string;
}

const linkSentence =
    'To show this work in another conversation, paste its Link line into haus message send.';

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
        // Agents paste this line; they never build a work link themselves.
        `Link: ${formatCloudAgentWorkLink(receipt.work.title, receipt.work.id)}`,
        linkSentence,
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
