import { ChatLoader } from '@heroui-pro/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useAgentActivityListener } from '../../../hooks/agents/use-current-agent-activity.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useChatEngagement } from '../../../hooks/servers/use-chat-engagement.ts';
import { springs } from '../../../lib/springs.ts';
import { type ChatTypist, formatChatTypingLabel, resolveChatTypists } from './chat-typing.ts';
import {
    chatTypingSentFace,
    isEngagedActivity,
    resolveChatTypingFace,
} from './chat-typing-launch.ts';
import {
    type ChatTypingLauncher,
    ChatTypingLaunches,
    useChatTypingLauncher,
} from './chat-typing-launches.tsx';

const maximumAvatars = 3;

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
    const engagements = useChatEngagement(serverId, chatId, (event) => {
        if (event.reason === 'sent') {
            launcher.launch(chatTypingSentFace);
        }
    });
    const agents = useAgents(serverId);
    const typists =
        engagements.length > 0 ? resolveChatTypists(engagements, agents.data ?? []) : [];

    // Matching the engaging run keeps an Agent busy in another Chat quiet here.
    useAgentActivityListener((event) => {
        const face = resolveChatTypingFace(event);
        if (face && event.serverId === serverId && isEngagedActivity(engagements, event)) {
            launcher.launch(face);
        }
    });

    return <ChatTypingStrip launcher={launcher} typists={typists} />;
}

/**
 * The composer reserves this row's height, so it never moves when an Agent
 * starts or stops. Only the content fades in and out.
 */
export function ChatTypingStrip({
    launcher,
    typists,
}: {
    /** Faces launched from the dots; absent in static previews. */
    launcher?: ChatTypingLauncher;
    typists: readonly ChatTypist[];
}) {
    const reduceMotion = useReducedMotion() === true;
    const label = formatChatTypingLabel(typists.map((typist) => typist.displayName));
    const transition = reduceMotion ? { duration: 0 } : { ...springs.moderate, bounce: 0 };

    return (
        <div
            aria-live="polite"
            className="pointer-events-none relative flex h-8 shrink-0 items-center pr-4 pb-2 pl-11 text-muted text-sm"
            data-slot="chat-typing"
            ref={launcher?.stripRef}
        >
            <AnimatePresence initial={false}>
                {label ? (
                    <motion.div
                        animate={{ opacity: 1 }}
                        className="flex min-w-0 items-center gap-1.5"
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        key="typing"
                        transition={transition}
                    >
                        <span aria-hidden="true" className="flex shrink-0 items-center gap-0.5">
                            {typists.slice(0, maximumAvatars).map((typist) => (
                                <EntityAvatar
                                    key={typist.agentId}
                                    name={typist.displayName}
                                    size={16}
                                    src={typist.avatarUrl}
                                />
                            ))}
                        </span>
                        <span className="sr-only">{label}</span>
                        <span className="flex shrink-0" ref={launcher?.dotsRef}>
                            <ChatLoader.Dots size="sm" />
                        </span>
                    </motion.div>
                ) : null}
            </AnimatePresence>
            {launcher ? (
                <ChatTypingLaunches finish={launcher.finish} launches={launcher.launches} />
            ) : null}
        </div>
    );
}
