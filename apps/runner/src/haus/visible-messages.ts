import * as z from 'zod';

export interface VisibleMessage {
    readonly chatId: string;
    readonly id: string;
    readonly sequence: number;
}

const messageSchema = z
    .object({ chat_id: z.string().min(1), id: z.string().min(1), sequence: z.number().int() })
    .transform((message) => ({
        chatId: message.chat_id,
        id: message.id,
        sequence: message.sequence,
    }));
const messageRowSchema = z.object({ message: messageSchema }).transform((row) => row.message);
const heldSchema = z.object({ shownMessages: z.array(messageSchema), state: z.literal('held') });

const visibleByPath: Readonly<Record<string, z.ZodType<VisibleMessage[]>>> = {
    '/api/agent/workers': heldSchema.transform((body) => body.shownMessages),
    '/api/agent/events': z
        .object({ messages: z.array(messageRowSchema) })
        .transform((body) => body.messages),
    '/api/agent/history': z
        .object({ messages: z.array(messageSchema) })
        .transform((body) => body.messages),
    '/api/agent/messages/react': messageRowSchema.transform((message) => [message]),
    '/api/agent/messages/search': z
        .object({ messages: z.array(messageSchema) })
        .transform((body) => body.messages),
    '/api/agent/messages/send': z.union([
        heldSchema.transform((body) => body.shownMessages),
        z
            .object({ recentUnread: z.array(messageRowSchema) })
            .transform((body) => body.recentUnread),
    ]),
};

const resolvedMessagePath = /^\/api\/agent\/messages\/[^/]+$/u;

export function visibleMessagesIn(pathname: string, body: unknown) {
    const schema =
        visibleByPath[pathname] ??
        (resolvedMessagePath.test(pathname)
            ? messageRowSchema.transform((message) => [message])
            : undefined);
    return schema?.safeParse(body).data ?? [];
}

export function servedAutomationIdsIn(pathname: string, body: unknown) {
    if (pathname !== '/api/agent/events') {
        return [];
    }
    const parsed = z.object({ automations: z.array(z.object({ id: z.string() })) }).safeParse(body);
    return parsed.data?.automations.map((automation) => automation.id) ?? [];
}

const committedSendSchema = z.object({
    message: z.object({ chat_id: z.string().min(1) }).optional(),
    state: z.literal('sent'),
});

export function committedSendIn(pathname: string, requestBody: string, body: unknown) {
    const committed = committedSendSchema.safeParse(body);
    if (!(pathname === '/api/agent/messages/send' && committed.success)) {
        return null;
    }
    const done = z.object({ done: z.literal(true) }).safeParse(parseRequest(requestBody)).success;
    return { chatId: committed.data.message?.chat_id ?? null, done };
}

export async function attestVisibleMessages(
    authority: { runCredential: string; serverUrl: string },
    messages: readonly VisibleMessage[]
) {
    const response = await fetch(new URL('/api/agent/events/visible', authority.serverUrl), {
        body: JSON.stringify({ messages }),
        headers: {
            authorization: `Bearer ${authority.runCredential}`,
            'content-type': 'application/json',
        },
        method: 'POST',
    }).catch(() => null);
    if (!response?.ok) {
        return null;
    }
    const parsed = z
        .object({ accepted: z.array(z.string()) })
        .safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
        return null;
    }
    const accepted = new Set(parsed.data.accepted);
    return messages.filter((message) => accepted.has(message.id));
}

function parseRequest(text: string) {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}
