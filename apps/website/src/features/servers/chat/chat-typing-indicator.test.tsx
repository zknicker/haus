import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Agent, ChatEngagement } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc, type ServerDetail } from '../../../lib/haus-server.tsx';
import { testChat } from '../../chats/chat-fixtures.ts';
import { testAgent } from '../../members/agent-fixtures.ts';
import type { ChatInlineReplyTarget } from './chat-inline-reply.tsx';
import { ChatTypingIndicator, ChatTypingStrip } from './chat-typing-indicator.tsx';
import { ChatViewFooter } from './chat-view-footer.tsx';

const serverId = 'server_one';
const chatId = 'chat_one';

test('an idle strip is empty but keeps its reserved height', () => {
    const markup = renderToStaticMarkup(<ChatTypingStrip typists={[]} />);
    expect(markup).toContain('data-slot="chat-typing"');
    expect(markup).toContain('h-6');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).not.toContain(' typing');
    expect(markup).not.toContain('chat-loader-dots');
});

test('one typist shows an avatar, the label, and the stock dots', () => {
    const markup = renderToStaticMarkup(
        <ChatTypingStrip
            typists={[{ agentId: 'agt_juniper', avatarUrl: null, displayName: 'Juniper' }]}
        />
    );
    expect(markup).toContain('Juniper is typing');
    expect(markup).toContain('data-slot="chat-loader-dots"');
    expect(markup.match(/class="avatar /g)).toHaveLength(1);
});

test('the strip caps avatars at three while the label counts everyone', () => {
    const names = ['Juniper', 'Cove', 'Ash', 'Fen'];
    const markup = renderToStaticMarkup(
        <ChatTypingStrip
            typists={names.map((displayName) => ({
                agentId: `agt_${displayName}`,
                avatarUrl: null,
                displayName,
            }))}
        />
    );
    expect(markup).toContain('Juniper, Cove, and 2 others are typing');
    expect(markup.match(/class="avatar /g)).toHaveLength(3);
});

test('the dots stop under reduced motion through the stock loader styles', () => {
    const entry = fileURLToPath(import.meta.resolve('@heroui-pro/react'));
    const css = readFileSync(entry.replace(/index\.js$/, 'css/components/chat-loader.css'), 'utf8');
    expect(css).toMatch(
        /@media \(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.chat-loader__dot[^{]*\{[^}]*animation:\s*none/
    );
});

test('the indicator names engaged Agents from the cached roster', () => {
    const markup = render(
        seededClient([engagement('agt_juniper'), engagement('agt_cove')]),
        <ChatTypingIndicator chatId={chatId} serverId={serverId} />
    );
    expect(markup).toContain('Juniper and Cove are typing');
});

test('a Thread without its chat yet still reserves the strip', () => {
    const markup = render(
        new QueryClient(),
        <ChatTypingIndicator chatId={undefined} serverId={serverId} />
    );
    expect(markup).toContain('data-slot="chat-typing"');
    expect(markup).not.toContain(' typing');
});

test('the chat footer mounts the strip directly above the composer', () => {
    const markup = renderFooter(null);
    const strip = markup.indexOf('data-slot="chat-typing"');
    expect(strip).toBeGreaterThan(-1);
    expect(markup.indexOf('Juniper is typing')).toBeGreaterThan(strip);
    expect(markup.indexOf('Message planning')).toBeGreaterThan(strip);
});

test('an open inline reply stacks under the typing row instead of covering it', () => {
    const parent = {
        author: { kind: 'human' as const, userId: 'usr_one' },
        content: 'Ship it?',
        createdAt: '2026-09-23T12:00:00.000Z',
        id: 'msg_root',
        sequence: 1,
    };
    const markup = renderFooter({
        author: parent.author,
        content: parent.content,
        messageId: parent.id,
        parent,
        root: parent,
    });
    // Typing and the reply bar share one bottom-anchored stack, so the bar
    // grows beneath the typing row rather than overlaying its reserved slot.
    const stack = markup.indexOf('data-slot="chat-composer-stack"');
    const strip = markup.indexOf('data-slot="chat-typing"');
    const reply = markup.indexOf('data-inline-reply-reference');
    expect(stack).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(stack);
    expect(reply).toBeGreaterThan(strip);
    expect(markup.indexOf('Message planning')).toBeGreaterThan(reply);
    expect(markup.indexOf('Juniper is typing')).toBeGreaterThan(strip);
    expect(markup.match(/absolute[^"]*bottom-full/g)).toHaveLength(1);
});

function renderFooter(inlineReply: ChatInlineReplyTarget | null) {
    return render(
        seededClient([engagement('agt_juniper')]),
        <ChatViewFooter
            chat={testChat({ id: chatId, serverId })}
            chatName="planning"
            ensureDmError={null}
            inlineReply={inlineReply}
            onInlineReplyCancel={() => undefined}
            onInlineReplySent={() => undefined}
            peerRetired={false}
            readSequence={undefined}
            server={{ role: 'member' } as ServerDetail}
        />
    );
}

function engagement(agentId: string): ChatEngagement {
    return { agentId, chatId, runId: `run_${agentId}`, startedAt: '2026-09-23T12:00:00.000Z' };
}

function seededClient(engagements: ChatEngagement[]) {
    const queryClient = new QueryClient();
    const agents: Agent[] = [
        testAgent({ displayName: 'Juniper', id: 'agt_juniper' }),
        testAgent({ displayName: 'Cove', id: 'agt_cove' }),
    ];
    queryClient.setQueryData(getQueryKey(hausTrpc.agent.list, { serverId }, 'query'), agents);
    queryClient.setQueryData(
        getQueryKey(hausTrpc.chat.engagements, { chatId, serverId }, 'query'),
        { engagements }
    );
    return queryClient;
}

function render(queryClient: QueryClient, children: ReactNode) {
    const client = hausTrpc.createClient({ links: [] });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                {children}
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
