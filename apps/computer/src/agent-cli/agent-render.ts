import {
    formatAgentReferenceTarget,
    formatUserReferenceTarget,
    type HausAgentSendResponse,
} from '@haus/api';
import type { z } from 'zod';
import { formatThreadFollowRestoration } from '../inbox-format.ts';
import type {
    AgentCliMessage,
    agentChannelMembersSchema,
    agentChannelSchema,
    agentHistoryResponseSchema,
    agentServerInfoSchema,
} from './agent-api-schemas.ts';
import { AgentCliError } from './agent-error.ts';
import {
    formatDeliveryEnvelope,
    formatHistoryLine,
    formatSender,
    formatUtcTime,
    shortMessageId,
} from './agent-format.ts';

type AgentSendResponse = HausAgentSendResponse;
type AgentHistoryResponse = z.infer<typeof agentHistoryResponseSchema>;
type AgentServerInfo = z.infer<typeof agentServerInfoSchema>;
type AgentChannel = z.infer<typeof agentChannelSchema>;
type AgentChannelMembers = z.infer<typeof agentChannelMembersSchema>;

export function renderSendResponse(target: string, response: AgentSendResponse): string {
    return response.state === 'sent'
        ? renderSent(target, response.message, response.recentUnread)
        : renderHeld(target, response);
}

/** `anchored`: the read used --before, --after, or --around, so the cursor hint is noise. */
export function renderHistory(
    response: AgentHistoryResponse,
    options: { anchored?: boolean } = {}
): string {
    const reactivated = new Set(response.thread_follow_reactivated_message_ids);
    const readThrough = response.last_read.after;
    const lines = [
        `## Message History for ${response.target} (${response.messages.length} messages)`,
        ...(readThrough > 0 && !options.anchored
            ? [
                  `Server unread cursor before this read: seq ${readThrough}. Use haus message read --target "${response.target}" --after ${readThrough} to browse newer messages.`,
              ]
            : []),
        '',
        ...response.messages.flatMap((message) => [
            ...(reactivated.has(message.id)
                ? [formatThreadFollowRestoration(response.target)]
                : []),
            formatHistoryLine(message),
        ]),
    ];
    const footer = historyFooter(response);
    if (footer) {
        lines.push('', footer);
    }
    return `${lines.join('\n')}\n`;
}

export function renderSearchResult(
    source: string,
    message: AgentCliMessage,
    query: string
): string {
    return [
        `<result ref="msg:${message.id}">`,
        `Source: ${source}`,
        `Sender: ${formatSender(message)}`,
        `Time: ${formatUtcTime(message.created_at)}`,
        '<preview>',
        preview(message.content, query),
        '</preview>',
        '</result>',
    ].join('\n');
}

export function renderSearchFooter(): string {
    return 'Use haus message read --target <target> --around <id> to read surrounding context.';
}

export function renderServerInfo(
    response: AgentServerInfo,
    filters: { joined?: boolean; query?: string } = {}
): string {
    const lines = [
        '## Server summary',
        `${response.total.channels} channels · ${response.total.agents} agents · ${response.total.humans} humans`,
        'Use --channels, --agents, --humans, --joined, or --query <text> to narrow this view.',
        'Copy a person or Agent link into notes and messages to keep its identity across handle changes.',
    ];
    if (response.channels.length > 0) {
        lines.push(
            '',
            '## Server Channels',
            ...response.channels.map(
                (channel) =>
                    `#${channel.handle} [${channel.joined ? 'joined' : 'not joined'}]${descriptionSuffix(channel.description)}`
            )
        );
    }
    if (response.agents.length > 0) {
        lines.push(
            '',
            '## Server Agents',
            ...response.agents.map((agent) => renderPerson(agent, 'agent'))
        );
    }
    if (response.humans.length > 0) {
        lines.push(
            '',
            '## Server Humans',
            ...response.humans.map((human) => renderPerson(human, 'user'))
        );
    }
    const nextCommands = serverInfoNextCommands(response, filters);
    if (nextCommands.length > 0) {
        lines.push('', ...nextCommands);
    }
    return `${lines.join('\n')}\n`;
}

export function renderChannelInfo(channel: AgentChannel): string {
    return [
        `## Channel #${channel.handle}`,
        `Joined: ${channel.joined ? 'yes' : 'no'}`,
        `Description: ${channel.description ?? 'No description.'}`,
        `Members: ${channel.memberCount}`,
        '',
        `Use haus channel members "#${channel.handle}" to list members.`,
        '',
    ].join('\n');
}

export function renderChannelMembers(response: AgentChannelMembers): string {
    const members = response.members.map((member) => {
        if (!member.handle) {
            throw new AgentCliError('INVALID_JSON_RESPONSE', 'Channel member handle is missing.');
        }
        const handle = member.handle;
        const zone = member.role === 'human' ? timezoneSuffix(member.timezone) : '';
        return `@${handle} [${member.role}]${zone}${descriptionSuffix(member.description)}`;
    });
    return [
        `## Channel Members for ${response.target} (${members.length} members)`,
        ...members,
        '',
    ].join('\n');
}

function renderSent(
    target: string,
    message: AgentCliMessage,
    unread: Array<{ message: AgentCliMessage; target: string }>
): string {
    const lines = [`Message sent to ${target}. Message ID: ${message.id}`];
    if (!isThreadTarget(target)) {
        lines.push(
            `(to reply in this message's thread, use target "${target}:${shortMessageId(message.id)}")`
        );
    }
    if (unread.length > 0) {
        lines.push(
            '',
            '--- New messages you may have missed ---',
            ...unread.map((row) => formatDeliveryEnvelope(row.target, row.message))
        );
    }
    return `${lines.join('\n')}\n`;
}

function renderHeld(
    target: string,
    response: Extract<AgentSendResponse, { state: 'held' }>
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
    lines.push('Your message was not sent; it is saved as a draft. Review this context.');
    if (response.formalMentionCount > 0) {
        lines.push(
            `You were formally mentioned in ${response.formalMentionCount} of these newer messages.`
        );
    }
    lines.push('', ...response.shownMessages.map(formatHistoryLine), '', 'Choose one path:');
    lines.push(
        `- Revise: send a new plain message to ${target}; it replaces the saved draft.`,
        `- Send unchanged: haus message send --send-draft --target "${target}"`,
        '- Stay silent only if no reply is needed or a delivered reply supersedes this draft.'
    );
    if (response.continueAnywaySuggested) {
        lines.push(
            `- After repeated holds, send unchanged anyway: haus message send --send-draft --anyway --target "${target}"`
        );
    }
    lines.push(
        'If a human request still needs an answer, first verify it against the newer context; then revise or send the valid draft before ending the turn.'
    );
    return `${lines.join('\n')}\n`;
}

function historyFooter(response: AgentHistoryResponse): string | null {
    if (!response.has_more) {
        return null;
    }
    const minimum = response.messages[0]?.sequence;
    const maximum = response.messages.at(-1)?.sequence;
    const teachings = [
        ...(response.has_older && minimum !== undefined
            ? [`Use --before ${minimum} to see older messages.`]
            : []),
        ...(response.has_newer && maximum !== undefined
            ? [`Use --after ${maximum} to see newer messages.`]
            : []),
    ];
    return `--- ${response.messages.length} messages shown. ${teachings.join(' ')} ---`;
}

function preview(content: string, query: string): string {
    const matchAt = content.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
    if (matchAt < 0 || query.length === 0) {
        const end = Math.min(content.length, 200);
        return `${escapeXml(content.slice(0, end))}${end < content.length ? '<omit />' : ''}`;
    }
    const start = Math.max(0, matchAt - 80);
    const end = Math.min(content.length, matchAt + query.length + 120);
    return [
        start > 0 ? '<omit />' : '',
        escapeXml(content.slice(start, matchAt)),
        `<match>${escapeXml(content.slice(matchAt, matchAt + query.length))}</match>`,
        escapeXml(content.slice(matchAt + query.length, end)),
        end < content.length ? '<omit />' : '',
    ].join('');
}

function renderPerson(
    person: { description: string | null; handle: string; id: string; timezone?: string | null },
    kind: 'agent' | 'user'
): string {
    if (kind === 'agent') {
        return `[@${person.handle}](${formatAgentReferenceTarget(person.id)})${descriptionSuffix(person.description)}`;
    }
    return `[@${person.handle}](${formatUserReferenceTarget(person.id)})${timezoneSuffix(person.timezone)}${descriptionSuffix(person.description)}`;
}

/** A human's zone: what an Agent resolves their daily@/weekly: reminders in. */
function timezoneSuffix(timezone: string | null | undefined): string {
    return ` [timezone: ${timezone ?? 'unknown'}]`;
}

function descriptionSuffix(description: string | null): string {
    return description ? ` — ${description}` : '';
}

function serverInfoNextCommands(
    response: AgentServerInfo,
    filters: { joined?: boolean; query?: string }
): string[] {
    const sectionFlags = [
        ['channels', '--channels'],
        ['agents', '--agents'],
        ['humans', '--humans'],
    ] as const;
    return sectionFlags.flatMap(([section, flag]) => {
        if (!response.hasMore[section]) {
            return [];
        }
        const command = [
            'haus server info',
            flag,
            ...(filters.joined ? ['--joined'] : []),
            ...(filters.query ? ['--query', quoteCommandValue(filters.query)] : []),
            `--offset ${response.offset + response.limit}`,
            `--limit ${response.limit}`,
        ];
        return [`Next: ${command.join(' ')}`];
    });
}

function quoteCommandValue(value: string): string {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function escapeXml(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function isThreadTarget(target: string): boolean {
    return /^#[^:]+:[^:]+$/u.test(target) || /^dm:@[^:]+:[^:]+$/u.test(target);
}
