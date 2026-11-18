import type {
    components,
    HausArtifact,
    HausChat,
    HausChatEvent,
    HausChatMessage,
    HausChatMessageReceipt,
    HausChatResponse,
    HausChatTimelinePage,
    HausClearChatReceipt,
    HausCreateChatRequest,
    HausCreateDeliveryRequest,
    HausCreateMessageRequest,
    HausDeleteResponseReceipt,
    HausEventList,
    HausListChatsResponse,
    HausListMessagesResponse,
    HausListResponsesResponse,
    HausMarkReadRequest,
    HausResponseActivity,
    HausResponseEvidence,
    HausTurnFileChangeEvidence,
    HausTurnPromptEvidence,
    HausUpsertArtifactRequest,
    HausUpsertResponseActivityRequest,
    HausUpsertResponseRequest,
} from '@haus/api';

type HausDeliveryReceipt = components['schemas']['DeliveryReceipt'];
type HausReadReceipt = components['schemas']['ReadReceipt'];
type HeaderFactory = HeadersInit | (() => HeadersInit | Promise<HeadersInit>);

export interface HausClientOptions {
    baseUrl: string;
    fetch?: typeof fetch;
    headers?: HeaderFactory;
    token?: string;
    WebSocket?: typeof WebSocket;
}

export interface HausRequestOptions {
    body?: unknown;
    headers?: HeadersInit;
    method?: string;
    query?: Record<string, number | string | null | undefined>;
}

export interface HausEventSocketOptions {
    onEvent?: (event: HausChatEvent) => void;
    onMessage?: (event: MessageEvent<string>) => void;
    recipientId?: string | null;
}

export class HausApiError extends Error {
    readonly payload: unknown;
    readonly status: number;

    constructor(status: number, payload: unknown) {
        super(`Haus API request failed with status ${status}.`);
        this.name = 'HausApiError';
        this.payload = payload;
        this.status = status;
    }
}

export class HausClient {
    readonly chat: HausChatClient;
    readonly message: HausMessageClient;
    readonly realtime: HausRealtimeClient;

    readonly #baseUrl: string;
    readonly #fetch: typeof fetch;
    readonly #headers?: HeaderFactory;
    readonly #token?: string;
    readonly #WebSocket?: typeof WebSocket;

    constructor(options: HausClientOptions) {
        this.#baseUrl = options.baseUrl.replace(/\/+$/u, '');
        this.#fetch = options.fetch ?? fetch;
        this.#headers = options.headers;
        this.#token = options.token;
        this.#WebSocket = options.WebSocket ?? globalThis.WebSocket;
        this.chat = new HausChatClient(this);
        this.message = new HausMessageClient(this);
        this.realtime = new HausRealtimeClient(this);
    }

    async request<ResponseBody>(path: string, options: HausRequestOptions = {}) {
        const response = await this.#fetch(this.url(path, options.query), {
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            headers: await this.headers(options.headers, options.body !== undefined),
            method: options.method ?? 'GET',
        });

        if (!response.ok) {
            throw new HausApiError(response.status, await readResponse(response));
        }

        return (await response.json()) as ResponseBody;
    }

    socket(path: string, query?: HausRequestOptions['query']) {
        if (!this.#WebSocket) {
            throw new Error('No WebSocket implementation is available.');
        }

        return new this.#WebSocket(this.websocketUrl(path, query));
    }

    private url(path: string, query?: HausRequestOptions['query']) {
        const url = new URL(path, `${this.#baseUrl}/`);
        appendQuery(url, query);
        return url;
    }

    private websocketUrl(path: string, query?: HausRequestOptions['query']) {
        const url = this.url(path, query);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return url;
    }

    private async headers(headers: HeadersInit | undefined, hasBody: boolean) {
        const output = new Headers(await resolveHeaders(this.#headers));

        if (hasBody && !output.has('content-type')) {
            output.set('content-type', 'application/json');
        }

        if (this.#token && !output.has('authorization')) {
            output.set('authorization', `Bearer ${this.#token}`);
        }

        for (const [key, value] of new Headers(headers)) {
            output.set(key, value);
        }

        return output;
    }
}

class HausChatClient {
    readonly #client: HausClient;

    constructor(client: HausClient) {
        this.#client = client;
    }

    list(input: { cursor?: string | null; limit?: number; readerId?: string } = {}) {
        return this.#client.request<HausListChatsResponse>('/api/chats', {
            query: {
                cursor: input.cursor,
                limit: input.limit,
                reader_id: input.readerId,
            },
        });
    }

    create(input: HausCreateChatRequest) {
        return this.#client.request<HausChat>('/api/chats', {
            body: input,
            method: 'POST',
        });
    }

    get(chatId: string, input: { readerId?: string } = {}) {
        return this.#client.request<HausChat>(`/api/chats/${encodeURIComponent(chatId)}`, {
            query: { reader_id: input.readerId },
        });
    }

    messages(
        chatId: string,
        input: { afterSequence?: number; beforeSequence?: number; limit?: number } = {}
    ) {
        return this.#client.request<HausListMessagesResponse>(
            `/api/chats/${encodeURIComponent(chatId)}/messages`,
            {
                query: {
                    after_sequence: input.afterSequence,
                    before_sequence: input.beforeSequence,
                    limit: input.limit,
                },
            }
        );
    }

    searchMessages(chatId: string, input: { limit?: number; query: string }) {
        return this.#client.request<HausListMessagesResponse>(
            `/api/chats/${encodeURIComponent(chatId)}/messages/search`,
            {
                query: {
                    limit: input.limit,
                    query: input.query,
                },
            }
        );
    }

    timeline(
        chatId: string,
        input: { beforeSequence?: number; limit?: number; readerId?: string } = {}
    ) {
        return this.#client.request<HausChatTimelinePage>(
            `/api/chats/${encodeURIComponent(chatId)}/timeline`,
            {
                query: {
                    before_sequence: input.beforeSequence,
                    limit: input.limit,
                    reader_id: input.readerId,
                },
            }
        );
    }

    responses(chatId: string, input: { afterSequence?: number; limit?: number } = {}) {
        return this.#client.request<HausListResponsesResponse>(
            `/api/chats/${encodeURIComponent(chatId)}/responses`,
            {
                query: {
                    after_sequence: input.afterSequence,
                    limit: input.limit,
                },
            }
        );
    }

    activity(chatId: string, activityId: string) {
        return this.#client.request<HausResponseActivity>(
            `/api/chats/${encodeURIComponent(chatId)}/activity/${encodeURIComponent(activityId)}`
        );
    }

    responseEvidence(chatId: string, responseId: string) {
        return this.#client.request<HausResponseEvidence>(
            `/api/chats/${encodeURIComponent(chatId)}/responses/${encodeURIComponent(responseId)}/evidence`
        );
    }

    turnPrompt(runId: string) {
        return this.#client.request<HausTurnPromptEvidence>(
            `/api/turns/${encodeURIComponent(runId)}/prompt`
        );
    }

    turnFileChanges(runId: string) {
        return this.#client.request<HausTurnFileChangeEvidence>(
            `/api/turns/${encodeURIComponent(runId)}/file-changes`
        );
    }

    createMessage(chatId: string, input: HausCreateMessageRequest) {
        return this.#client.request<HausChatMessageReceipt>(
            `/api/chats/${encodeURIComponent(chatId)}/messages`,
            {
                body: input,
                method: 'POST',
            }
        );
    }

    createDelivery(chatId: string, input: HausCreateDeliveryRequest) {
        return this.#client.request<HausDeliveryReceipt>(
            `/api/chats/${encodeURIComponent(chatId)}/deliveries`,
            {
                body: input,
                method: 'POST',
            }
        );
    }

    upsertResponse(chatId: string, input: HausUpsertResponseRequest) {
        return this.#client.request<HausChatResponse>(
            `/api/chats/${encodeURIComponent(chatId)}/responses`,
            {
                body: input,
                method: 'POST',
            }
        );
    }

    upsertResponseActivity(
        chatId: string,
        responseId: string,
        input: HausUpsertResponseActivityRequest
    ) {
        return this.#client.request<HausResponseActivity>(
            `/api/chats/${encodeURIComponent(chatId)}/responses/${encodeURIComponent(responseId)}/activity`,
            {
                body: input,
                method: 'POST',
            }
        );
    }

    upsertArtifact(chatId: string, input: HausUpsertArtifactRequest) {
        return this.#client.request<HausArtifact>(
            `/api/chats/${encodeURIComponent(chatId)}/artifacts`,
            {
                body: input,
                method: 'POST',
            }
        );
    }

    markRead(chatId: string, input: HausMarkReadRequest) {
        return this.#client.request<HausReadReceipt>(
            `/api/chats/${encodeURIComponent(chatId)}/read`,
            {
                body: input,
                method: 'POST',
            }
        );
    }

    clear(chatId: string) {
        return this.#client.request<HausClearChatReceipt>(
            `/api/chats/${encodeURIComponent(chatId)}/clear`,
            {
                method: 'POST',
            }
        );
    }

    deleteResponse(responseId: string) {
        return this.#client.request<HausDeleteResponseReceipt>(
            `/api/responses/${encodeURIComponent(responseId)}`,
            {
                method: 'DELETE',
            }
        );
    }
}

class HausRealtimeClient {
    readonly #client: HausClient;

    constructor(client: HausClient) {
        this.#client = client;
    }

    events(input: { limit?: number; recipientId?: string | null } = {}) {
        return this.#client.request<HausEventList>('/api/events', {
            query: {
                limit: input.limit,
                recipient_id: input.recipientId,
            },
        });
    }

    connect(input: HausEventSocketOptions = {}) {
        const socket = this.#client.socket('/api/events/ws', {
            recipient_id: input.recipientId,
        });

        if (input.onMessage) {
            socket.addEventListener('message', input.onMessage as EventListener);
        }

        if (input.onEvent) {
            socket.addEventListener('message', (event: MessageEvent<string>) => {
                input.onEvent?.(JSON.parse(event.data) as HausChatEvent);
            });
        }

        return socket;
    }
}

class HausMessageClient {
    readonly #client: HausClient;

    constructor(client: HausClient) {
        this.#client = client;
    }

    get(messageId: string) {
        return this.#client.request<HausChatMessage>(
            `/api/messages/${encodeURIComponent(messageId)}`
        );
    }
}

export function createHausClient(options: HausClientOptions) {
    return new HausClient(options);
}

function appendQuery(url: URL, query: HausRequestOptions['query']) {
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    }
}

async function resolveHeaders(headers: HeaderFactory | undefined) {
    if (typeof headers === 'function') {
        return await headers();
    }

    return headers;
}

async function readResponse(response: Response) {
    const text = await response.text();

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}
