import type { Agent } from '@haus/api';
import { parseAgentReferenceTarget } from '@haus/api/rich-references';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import {
    type MentionComposerScaffold,
    useMentionComposerScaffold,
} from './mention-composer-scaffold.ts';
import { MentionEditor, type MentionEditorHandle } from './mention-editor.tsx';
import {
    buildAgentMentionOption,
    filterMentionOptionsForQuery,
    type MentionAgent,
} from './mention-options.ts';
import { MentionPicker } from './mention-picker.tsx';
import type { ActiveMentionQuery, Mention, MentionOption } from './mention-types.ts';
import { selectVisibleOptions } from './mention-visible-options.ts';

export {
    resolveSkillScopeAgentIds,
    resolveSkillScopeAgentIdsKey,
} from './mention-composer-scaffold.ts';

export interface MentionComposerState {
    activeIndex: number;
    editorRef: React.RefObject<MentionEditorHandle | null>;
    focusTextEditor: () => void;
    handleKeyDown: (event: KeyboardEvent) => boolean;
    handleMentionSelect: (option: MentionOption) => void;
    handleTextChange: (content: string, mentions: Mention[]) => void;
    hasQuery: boolean;
    isPathSearchActive: boolean;
    isPathSearchLoading: boolean;
    mentions: Mention[];
    onActiveQueryChange: (query: ActiveMentionQuery | null) => void;
    options: MentionOption[];
    prefetchMentionOptions: () => void;
    value: string;
}

export function useServerMentionComposer({
    agents,
    chatTarget,
    content,
    initialMentions,
    mentionableAgentIds,
    onMentionsChange,
    onSubmit,
    onTextChange,
    serverId,
}: {
    agents: readonly Agent[];
    chatTarget: { agentId: string; kind: 'agent-dm' } | { chatId: string; kind: 'chat' };
    content: string;
    initialMentions?: readonly Mention[];
    mentionableAgentIds: readonly string[];
    onMentionsChange?: (mentions: Mention[]) => void;
    onSubmit?: () => void;
    onTextChange: (content: string) => void;
    serverId: string;
}) {
    const mentionAgents = React.useMemo<MentionAgent[]>(
        () =>
            agents.map((agent) => ({
                avatarUrl: agent.avatarUrl,
                id: agent.id,
                name: agent.displayName,
            })),
        [agents]
    );
    const scaffold = useMentionComposerScaffold({
        agentId: mentionableAgentIds[0] ?? '',
        initialMentions,
        mentionableAgentIds,
    });
    const targetAgentId = chatTarget.kind === 'agent-dm' ? chatTarget.agentId : null;
    const targetChatId = chatTarget.kind === 'chat' ? chatTarget.chatId : null;
    const input = React.useMemo(
        () =>
            targetAgentId
                ? {
                      agentId: targetAgentId,
                      agentIds: [...scaffold.skillScopeAgentIds],
                      serverId,
                      targetKind: 'agent-dm' as const,
                  }
                : {
                      agentIds: [...scaffold.skillScopeAgentIds],
                      chatId: targetChatId ?? '',
                      serverId,
                  },
        [scaffold.skillScopeAgentIds, serverId, targetAgentId, targetChatId]
    );
    const optionsQuery = hausTrpc.chat.mentionOptions.useQuery(input, {
        enabled: scaffold.activeQuery !== null,
    });
    const utils = hausTrpc.useUtils();
    const options = React.useMemo(
        () =>
            filterMentionOptionsForQuery(
                (optionsQuery.data?.options ?? []).map((option): MentionOption => {
                    if (option.kind !== 'agent') {
                        return option;
                    }
                    const agentId = parseAgentReferenceTarget(option.id);
                    return agentId
                        ? buildAgentMentionOption({ agentId, agents: mentionAgents })
                        : option;
                }),
                scaffold.activeQuery?.query ?? ''
            ),
        [mentionAgents, optionsQuery.data?.options, scaffold.activeQuery?.query]
    );
    const prefetchMentionOptions = React.useCallback(() => {
        // Depend on the memoized `utils` root, never on a `utils.chat.mentionOptions`
        // proxy path: tRPC rebuilds that path object on every access, so depending on
        // it re-created this callback each render and prefetched once per keystroke.
        void utils.chat.mentionOptions.prefetch(input, queryPolicy.syncedSnapshot);
    }, [input, utils]);

    return useMentionComposerController({
        content,
        mentionOptionsState: {
            isPathSearchActive: false,
            isPathSearchLoading: optionsQuery.isLoading || optionsQuery.isFetching,
            options,
        },
        onMentionsChange,
        onSubmit,
        onTextChange,
        prefetchMentionOptions,
        scaffold,
    });
}

export function useMentionComposerController({
    content,
    mentionOptionsState,
    onMentionsChange,
    onSubmit,
    onTextChange,
    prefetchMentionOptions,
    scaffold,
}: {
    content: string;
    mentionOptionsState: {
        isPathSearchActive: boolean;
        isPathSearchLoading: boolean;
        options: MentionOption[];
    };
    onMentionsChange?: (mentions: Mention[]) => void;
    onSubmit?: () => void;
    onTextChange: (content: string) => void;
    prefetchMentionOptions: () => void;
    scaffold: MentionComposerScaffold;
}) {
    const editorRef = React.useRef<MentionEditorHandle | null>(null);
    const dismissedQueryRef = React.useRef<ActiveMentionQuery | null>(null);
    const [activeIndex, setActiveIndex] = React.useState(0);
    const { activeQuery, mentions, setActiveQuery, setMentions } = scaffold;
    const trigger = activeQuery?.trigger ?? '@';
    const visibleMentionOptions = selectVisibleOptions({
        activeQuery,
        mentionOptions: mentionOptionsState.options,
    });

    React.useEffect(() => {
        prefetchMentionOptions();
    }, [prefetchMentionOptions]);

    React.useEffect(() => {
        if (visibleMentionOptions.length === 0) {
            setActiveIndex(0);
            return;
        }

        setActiveIndex((index) => Math.min(index, visibleMentionOptions.length - 1));
    }, [visibleMentionOptions.length]);

    React.useEffect(() => {
        if (content.length === 0 && mentions.length > 0) {
            setMentions([]);
            onMentionsChange?.([]);
        }
    }, [content.length, mentions.length, onMentionsChange, setMentions]);

    function commitMentions(nextMentions: Mention[]) {
        setMentions(nextMentions);
        onMentionsChange?.(nextMentions);
    }

    function handleTextChange(nextContent: string, nextMentions: Mention[]) {
        onTextChange(nextContent);
        commitMentions(nextMentions);
    }

    function handleMentionSelect(option: MentionOption) {
        dismissedQueryRef.current = null;
        editorRef.current?.insertMention(option);
    }

    function handleKeyDown(event: KeyboardEvent) {
        return handlePickerKeyDown(event) || handleSubmitKeyDown(event);
    }

    function handlePickerKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            if (!(activeQuery || dismissedQueryRef.current)) {
                return false;
            }

            event.preventDefault();
            dismissedQueryRef.current = activeQuery ?? dismissedQueryRef.current;
            setActiveQuery(null);
            return true;
        }

        if (visibleMentionOptions.length === 0) {
            return false;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % visibleMentionOptions.length);
            return true;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(
                (index) => (index - 1 + visibleMentionOptions.length) % visibleMentionOptions.length
            );
            return true;
        }

        if (
            (event.key === 'Enter' && !(event.metaKey || event.ctrlKey || event.shiftKey)) ||
            event.key === 'Tab'
        ) {
            event.preventDefault();
            handleMentionSelect(visibleMentionOptions[activeIndex]);
            return true;
        }

        return false;
    }

    function handleActiveQueryChange(query: ActiveMentionQuery | null) {
        if (!query) {
            dismissedQueryRef.current = null;
            setActiveQuery(null);
            return;
        }

        if (isSameMentionQuery(query, dismissedQueryRef.current)) {
            setActiveQuery(null);
            return;
        }

        dismissedQueryRef.current = null;
        setActiveQuery(query);
    }

    function handleSubmitKeyDown(event: KeyboardEvent) {
        if (
            event.key !== 'Enter' ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.isComposing
        ) {
            return false;
        }

        event.preventDefault();
        onSubmit?.();
        return true;
    }

    return {
        activeIndex,
        editorRef,
        focusTextEditor: () => editorRef.current?.focus(),
        handleKeyDown,
        handleMentionSelect,
        handleTextChange,
        hasQuery: Boolean(activeQuery),
        isPathSearchActive:
            trigger !== '@' &&
            trigger !== '$' &&
            trigger !== '#' &&
            mentionOptionsState.isPathSearchActive,
        isPathSearchLoading:
            trigger !== '@' &&
            trigger !== '$' &&
            trigger !== '#' &&
            mentionOptionsState.isPathSearchLoading,
        mentions,
        onActiveQueryChange: handleActiveQueryChange,
        options: visibleMentionOptions,
        prefetchMentionOptions,
        value: content,
    } satisfies MentionComposerState;
}

function isSameMentionQuery(left: ActiveMentionQuery, right: ActiveMentionQuery | null) {
    return (
        right !== null &&
        left.end === right.end &&
        left.query === right.query &&
        left.start === right.start &&
        left.trigger === right.trigger
    );
}

export function MentionComposerEditor({
    ariaLabel,
    autoFocus,
    composer,
    disabled,
    id,
    mentions,
    name,
    placeholder,
}: {
    ariaLabel: string;
    autoFocus?: boolean;
    composer: MentionComposerState;
    disabled?: boolean;
    id?: string;
    mentions?: readonly Mention[];
    name: string;
    placeholder?: string;
}) {
    return (
        <MentionEditor
            ariaLabel={ariaLabel}
            autoFocus={autoFocus}
            disabled={disabled}
            id={id}
            mentions={mentions ?? composer.mentions}
            name={name}
            onActiveQueryChange={composer.onActiveQueryChange}
            onChange={composer.handleTextChange}
            onFocus={composer.prefetchMentionOptions}
            onKeyDown={composer.handleKeyDown}
            placeholder={placeholder}
            ref={composer.editorRef}
            value={composer.value}
        />
    );
}

export function MentionComposerPicker({ composer }: { composer: MentionComposerState }) {
    return (
        <MentionPicker
            activeIndex={composer.activeIndex}
            hasQuery={composer.hasQuery}
            isPathSearchActive={composer.isPathSearchActive}
            isPathSearchLoading={composer.isPathSearchLoading}
            onSelect={composer.handleMentionSelect}
            options={composer.options}
        />
    );
}
