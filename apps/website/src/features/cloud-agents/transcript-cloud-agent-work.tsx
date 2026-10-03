import type { CloudAgentWork } from '@haus/api';
import {
    type TranscriptMessageRow,
    useTranscriptRenderContextOptional,
} from '../chats/chat-transcript-render-context.tsx';

/**
 * Cloud Agent work inside this Message's Thread, including settled work. The
 * transcript surface owns the read and hands it down through the render
 * context, so a row stays a row: it looks its own Message up, and learns
 * nothing about where work comes from.
 */
export function useHoistedCloudAgentWork(row: TranscriptMessageRow): readonly CloudAgentWork[] {
    const context = useTranscriptRenderContextOptional();
    return context?.hoistedCloudAgentWork?.get(row.message.id) ?? [];
}
