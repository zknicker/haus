import { ChatLoader } from '@heroui-pro/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useAgentActivityListener } from '../../../hooks/agents/use-current-agent-activity.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useChatEngagement } from '../../../hooks/servers/use-chat-engagement.ts';
import { springs } from '../../../lib/springs.ts';
import { type ChatTypist, formatChatTypingLabel, resolveChatTypists } from './chat-typing.ts';
import { withHeldEngagements } from './chat-typing-hold.ts';
import {
    admitChatTypingThinking,
    type ChatTypingThinkingLedger,
    chatTypingThinkingFace,
    isEngagedActivity,
    resolveChatTypingFace,
    syncChatTypingThinking,
} from './chat-typing-launch.ts';
import {
    type ChatTypingLauncher,
    ChatTypingLaunches,
    useChatTypingLauncher,
} from './chat-typing-launches.tsx';
import { type ChatTypingThoughts, shownChatTypingThought } from './chat-typing-thought.ts';
import { ChatTypingThoughtBubble, useChatTypingThought } from './chat-typing-thought-bubble.tsx';
import { useChatTypingEnds } from './use-chat-typing-ends.ts';
import { useChatTypingThoughtRecall } from './use-chat-typing-thought-recall.ts';

const maximumAvatars = 3;
const noThoughts: ChatTypingThoughts = { latest: null, live: null };

/** Which Agents are answering this Chat right now, above its composer. */
export function ChatTypingIndicator({
    chatId,
    serverId,
}: {
    /** Undefined while a Thread has no chat yet; the row still holds its height. */
    chatId: string | undefined;
    serverId: string;
}) {
    const launcher = useChatTypingLauncher();
    const ends = useChatTypingEnds(serverId, chatId, launcher.launch);
    const engagements = useChatEngagement(serverId, chatId, ends.onEnded);
    // A `--done` reply's Agent keeps its dots until the reply renders.
    const shown = withHeldEngagements(engagements, ends.holds);
    const agents = useAgents(serverId);
    const typists = shown.length > 0 ? resolveChatTypists(shown, agents.data ?? []) : [];

    // 🤔 launches as an engagement appears, once; its run's `thinking` activity stays quiet.
    const thinking = React.useRef<ChatTypingThinkingLedger>({ launched: new Set() });
    const { launch } = launcher;
    React.useEffect(() => {
        // Agents that appear together share one 🤔: the launch throttle drops the repeat.
        if (chatId && syncChatTypingThinking(thinking.current, chatId, engagements) > 0) {
            launch(chatTypingThinkingFace);
        }
    }, [chatId, engagements, launch]);

    // Matching the engaging run keeps an Agent busy in another Chat quiet here.
    useAgentActivityListener((event) => {
        const face = resolveChatTypingFace(event);
        if (!(face && chatId && event.serverId === serverId)) {
            return;
        }
        if (!isEngagedActivity(engagements, event)) {
            return;
        }
        if (
            face !== chatTypingThinkingFace ||
            admitChatTypingThinking(thinking.current, chatId, event)
        ) {
            launcher.launch(face);
        }
    });

    const thoughts = useChatTypingThought(serverId, chatId, engagements);

    return <ChatTypingStrip launcher={launcher} thoughts={thoughts} typists={typists} />;
}

/**
 * The composer reserves this row's height, so it never moves when an Agent
 * starts or stops. Only the content fades in and out.
 */
export function ChatTypingStrip({
    launcher,
    thoughts = noThoughts,
    typists,
}: {
    /** Faces launched from the dots; absent in static previews. */
    launcher?: ChatTypingLauncher;
    /** A thinking Agent's condensed thoughts, shown over its avatar (ADR 0036). */
    thoughts?: ChatTypingThoughts;
    typists: readonly ChatTypist[];
}) {
    const reduceMotion = useReducedMotion() === true;
    const ownStripRef = React.useRef<HTMLDivElement | null>(null);
    const stripRef = launcher?.stripRef ?? ownStripRef;
    const label = formatChatTypingLabel(typists.map((typist) => typist.displayName));
    const transition = reduceMotion ? { duration: 0 } : { ...springs.moderate, bounce: 0 };
    const recall = useChatTypingThoughtRecall(label !== null);

    return (
        <div
            aria-live="polite"
            className="pointer-events-none relative flex h-8 shrink-0 items-center pr-4 pb-2 pl-11 text-muted text-sm"
            data-slot="chat-typing"
            ref={stripRef}
        >
            <AnimatePresence initial={false}>
                {label ? (
                    <motion.div
                        animate={{ opacity: 1 }}
                        className="pointer-events-auto flex min-w-0 items-center gap-1.5"
                        data-slot="chat-typing-recall"
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        key="typing"
                        // Hovering the faces and dots brings back the latest thought.
                        onPointerEnter={recall.onPointerEnter}
                        onPointerLeave={recall.onPointerLeave}
                        transition={transition}
                    >
                        <span aria-hidden="true" className="flex shrink-0 items-center gap-0.5">
                            {typists.slice(0, maximumAvatars).map((typist) => (
                                <span
                                    className="flex"
                                    data-typist-avatar={typist.agentId}
                                    key={typist.agentId}
                                >
                                    <EntityAvatar
                                        name={typist.displayName}
                                        size={16}
                                        src={typist.avatarUrl}
                                    />
                                </span>
                            ))}
                        </span>
                        <span className="sr-only">{label}</span>
                        <span className="flex shrink-0" ref={launcher?.dotsRef}>
                            <ChatLoader.Dots size="sm" />
                        </span>
                    </motion.div>
                ) : null}
            </AnimatePresence>
            <ChatTypingThoughtBubble
                stripRef={stripRef}
                thought={label ? shownChatTypingThought(thoughts, recall.recalled) : null}
            />
            {launcher ? (
                <ChatTypingLaunches finish={launcher.finish} launches={launcher.launches} />
            ) : null}
        </div>
    );
}
