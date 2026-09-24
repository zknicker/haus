export type MentionKind =
    | 'agent'
    | 'app'
    | 'chat'
    | 'directory'
    | 'file'
    | 'image'
    | 'plugin'
    | 'skill'
    | 'user';
export type ReferenceKind = MentionKind | 'pull-request' | 'website' | 'product';
export type MentionOptionKind = MentionKind;
export type MentionTrigger = '@' | '$' | '#';
export type MentionProjection =
    | 'agent-reference'
    | 'capability-reference'
    | 'chat-reference'
    | 'image-input'
    | 'path-reference'
    | 'skill-activation'
    | 'user-reference';

export interface ReferenceActivationTarget {
    id: string;
    kind: ReferenceKind;
    label: string;
    metadata?: Record<string, unknown>;
}

export type ReferenceActivation = (reference: ReferenceActivationTarget) => void;

export interface Mention extends ReferenceActivationTarget {
    end: number;
    kind: MentionKind;
    projection: MentionProjection;
    start: number;
    text: string;
}

export interface MentionOption {
    description?: string | null;
    groupLabel?: string;
    id: string;
    insertText: string;
    kind: MentionOptionKind;
    label: string;
    metadata?: Record<string, unknown>;
    projection: MentionProjection;
    sourceLabel?: string | null;
}

export interface ActiveMentionQuery {
    end: number;
    query: string;
    start: number;
    trigger: MentionTrigger;
}
