import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import type { AgentInboxItem } from '../agent-inbox-item.ts';
import type {
    ComputerExecutionJournalDocument,
    ComputerExecutionJournalTool,
} from './execution-journal-types.ts';

/**
 * EXPERIMENT (wake-recycle prototype): a compact version of Raft's constructed wake panel
 * (wakeBriefingPanel.ts). Sources are runtime-neutral Computer records, so it works for every
 * runtime: received messages from the per-turn inbox record (`runtime/wake-recycle-inbox.jsonl`), and sent
 * messages, files in play, and recent actions from the execution journals
 * (`runtime/execution-journal`). Files are re-read live; nothing is replayed verbatim from the
 * retired runtime transcript. Facts only, no "your session was recycled" chrome.
 */
const budgetTokens = 8000;
const messageSectionTokens = 4000;
const maxMessages = 25;
const maxMessageTokens = 2000;
const recentActionCount = 12;
const maxObjects = 14;
const objectBodyTokens = 700;
const maxRereadBytes = 64 * 1024;
const journalRunWindow = 40;
export const seenInboxFileName = 'wake-recycle-inbox.jsonl';
const sensitivePath = /(secret|credential|password|token|\.key$|\.pem$)/iu;
const failure = /\b(error|failed|failure|denied|not found|no such file|traceback|exception)\b/iu;
const mutating =
    /(^|\s|;|&&)(rm|mv|cp|mkdir|touch|git (commit|push|merge|rebase|checkout)|npm i|bun add|haus message send|haus task)\b|>>?\s*\S/u;

interface Action {
    at: string;
    line: string;
}

interface Message {
    at: string;
    id?: string;
    text: string;
}

interface FileTouch {
    count: number;
    last: string;
    lastIndex: number;
}

export async function buildWakeBriefing(input: {
    agentRoot: string;
    /** The waking run: its own journal is empty and its inbox is already the wake prompt. */
    excludeRunId: string;
    /** The waking inbox is already the wake prompt. */
    excludeMessageIds: Set<string>;
    workspaceDir: string;
}): Promise<string | null> {
    const journals = (await readRecentJournals(input.agentRoot)).filter(
        (journal) => journal.runId !== input.excludeRunId
    );
    const tools = journals.flatMap((journal) => journal.tools);
    if (tools.length < 5) {
        return null;
    }
    const received = (await readReceivedMessages(input.agentRoot)).filter(
        (message) => !input.excludeMessageIds.has(message.id ?? '')
    );
    const messages = fitMessages(
        [...received, ...tools.flatMap(sentMessage)].sort((a, b) => a.at.localeCompare(b.at))
    );
    const actions = tools.slice(-recentActionCount).map(describeAction);
    const actionsSection = `<recent-actions span="${actions.length} of ${tools.length}" order="oldest first">\n${actions.map((action) => action.line).join('\n')}\n</recent-actions>`;
    const messagesSection =
        messages.length > 0
            ? `<recent-messages order="newest last" note="recent tail only; older messages not shown">\n${messages.map((message) => message.text).join('\n')}\n</recent-messages>`
            : null;
    let objectBudget = budgetTokens - tokens(messagesSection ?? '') - tokens(actionsSection) - 60;
    const objects: string[] = [];
    for (const [path, touch] of rankFiles(tools)) {
        if (objects.length >= maxObjects || objectBudget <= 80) {
            break;
        }
        const object = await describeObject(input.workspaceDir, path, touch, objectBudget);
        objects.push(object);
        objectBudget -= tokens(object);
    }
    const objectsSection =
        objects.length > 0 ? `<objects-in-play>\n${objects.join('\n')}\n</objects-in-play>` : null;
    return [messagesSection, objectsSection, actionsSection].filter(Boolean).join('\n\n');
}

async function readRecentJournals(agentRoot: string): Promise<ComputerExecutionJournalDocument[]> {
    const directory = join(agentRoot, 'runtime', 'execution-journal');
    const names = await readdir(directory).catch(() => [] as string[]);
    const documents = await Promise.all(
        names
            .filter((name) => name.endsWith('.json'))
            .map(async (name) => {
                try {
                    return JSON.parse(
                        await readFile(join(directory, name), 'utf8')
                    ) as ComputerExecutionJournalDocument;
                } catch {
                    return null;
                }
            })
    );
    return documents
        .filter((document): document is ComputerExecutionJournalDocument =>
            Array.isArray(document?.tools)
        )
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .slice(-journalRunWindow);
}

/** Received messages from the prototype's per-turn inbox record (wake-recycle-turn.ts). */
async function readReceivedMessages(agentRoot: string): Promise<Message[]> {
    const raw = await readFile(join(agentRoot, 'runtime', seenInboxFileName), 'utf8').catch(
        () => ''
    );
    const byId = new Map<string, Message>();
    for (const line of raw.split('\n')) {
        let item: Pick<AgentInboxItem, 'content' | 'createdAt' | 'id' | 'senderHandle' | 'target'>;
        try {
            item = JSON.parse(line);
        } catch {
            continue;
        }
        byId.set(item.id, {
            at: item.createdAt,
            id: item.id,
            text: `[target=${item.target} msg=${item.id} time=${stamp(item.createdAt)}] @${item.senderHandle}: ${item.content}`,
        });
    }
    return [...byId.values()];
}

function sentMessage(tool: ComputerExecutionJournalTool): Message[] {
    const command = commandOf(tool);
    if (!(command?.includes('haus message send') && outputText(tool).includes('Message sent'))) {
        return [];
    }
    const target = /--target\s+(?:'([^']+)'|"([^"]+)"|(\S+))/u.exec(command);
    const heredoc = /<<-?\s*'?(\w+)'?\n([\s\S]*?)\n\1/u.exec(command);
    const quoted = [...command.matchAll(/'([^']*)'|"([^"]*)"/gu)]
        .map((match) => match[1] ?? match[2] ?? '')
        .sort((a, b) => b.length - a.length)[0];
    const body = heredoc?.[2] ?? quoted ?? '';
    return [
        {
            at: tool.startedAt,
            text: `[target=${target?.[1] ?? target?.[2] ?? target?.[3] ?? '?'} time=${stamp(tool.startedAt)}] you sent: ${body}`,
        },
    ];
}

function fitMessages(messages: Message[]): Message[] {
    const kept = messages.slice(-maxMessages).map((message) =>
        tokens(message.text) > maxMessageTokens
            ? {
                  ...message,
                  text: `${message.text.slice(0, maxMessageTokens * 4)} [… truncated — read the channel for the rest]`,
              }
            : message
    );
    while (
        kept.length > 0 &&
        kept.reduce((sum, m) => sum + tokens(m.text), 0) > messageSectionTokens
    ) {
        kept.shift();
    }
    return kept;
}

function describeAction(tool: ComputerExecutionJournalTool, index: number): Action {
    const failed = tool.status === 'failed' || failure.test(outputText(tool).slice(0, 400));
    const command = commandOf(tool);
    const path = pathOf(tool);
    const isMutating =
        tool.toolName === 'fileChange' || (command !== null && mutating.test(command));
    const call = command
        ? `bash(${oneLine(command, 160)})`
        : `${tool.toolName}(${path ?? oneLine(JSON.stringify(tool.input ?? {}), 120)})`;
    const marks = `${failed ? '!' : ''}${isMutating ? '*' : ''}`;
    return {
        at: tool.startedAt,
        line: `s${index + 1} ${marks ? `${marks} ` : ''}${stamp(tool.startedAt)}Z ${call} → ${oneLine(outputText(tool), 60)}`,
    };
}

function rankFiles(tools: ComputerExecutionJournalTool[]): [string, FileTouch][] {
    const files = new Map<string, FileTouch>();
    tools.forEach((tool, index) => {
        const path = pathOf(tool) ?? catPath(commandOf(tool));
        if (!(path && /\.[A-Za-z0-9]+$/u.test(path)) || path.startsWith('/dev/')) {
            return;
        }
        const touch = files.get(path) ?? { count: 0, last: tool.startedAt, lastIndex: index };
        files.set(path, { count: touch.count + 1, last: tool.startedAt, lastIndex: index });
    });
    const maxIndex = Math.max(1, tools.length - 1);
    const score = (touch: FileTouch) => touch.count * (0.3 + touch.lastIndex / maxIndex);
    return [...files.entries()].sort((a, b) => score(b[1]) - score(a[1]));
}

async function describeObject(
    workspaceDir: string,
    path: string,
    touch: FileTouch,
    budget: number
): Promise<string> {
    const name = isAbsolute(path) ? relative(workspaceDir, path) : path;
    const pointer = `<object name="${name}" touched="${touch.count}x" last-observed="${stamp(touch.last)}Z"/>`;
    // MEMORY.md belongs to the memory-index block; sensitive files are pointers only.
    if (name === 'MEMORY.md' || sensitivePath.test(name)) {
        return pointer;
    }
    const absolute = isAbsolute(path) ? path : join(workspaceDir, path);
    try {
        if ((await stat(absolute)).size > maxRereadBytes) {
            return pointer;
        }
        const content = await readFile(absolute, 'utf8');
        const cap = Math.min(objectBodyTokens, Math.max(0, budget - 40)) * 4;
        const body =
            content.length > cap ? `${content.slice(0, cap)}\n[… truncated]` : content.trimEnd();
        return `<object name="${name}" touched="${touch.count}x" freshness="current — re-read just now">\n${body}\n</object>`;
    } catch {
        return pointer;
    }
}

function commandOf(tool: ComputerExecutionJournalTool): string | null {
    const input = tool.input;
    return tool.toolName === 'bash' && isRecord(input) && typeof input.command === 'string'
        ? input.command
        : null;
}

function pathOf(tool: ComputerExecutionJournalTool): string | null {
    const input = tool.input;
    if (!isRecord(input) || tool.toolName === 'bash') {
        return null;
    }
    const path = input.path ?? input.file_path;
    return typeof path === 'string' ? path : null;
}

/** `cat x`, `sed -n '1,80p' x`, `head x`: the last path-like argument of a simple read. */
function catPath(command: string | null): string | null {
    const match =
        command &&
        /^\s*(?:cat|head|tail|sed\s+-n\s+'[^']*'|nl -ba)\s+(?:-\S+\s+)*([\w./-]+)\s*$/u.exec(
            command
        );
    return match?.[1] ?? null;
}

function outputText(tool: ComputerExecutionJournalTool): string {
    const output = tool.final?.output ?? tool.output ?? tool.error ?? tool.final?.error;
    if (typeof output === 'string') {
        return output;
    }
    if (isRecord(output) && typeof output.formatted_output === 'string') {
        return output.formatted_output;
    }
    return output === undefined ? '' : JSON.stringify(output);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneLine(text: string, max: number): string {
    const flat = text.replace(/\s+/gu, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function stamp(iso: string): string {
    return iso.replace('T', ' ').slice(0, 19);
}

function tokens(text: string): number {
    return Math.ceil(text.length / 4);
}
