export type ToolIntentKind =
    | 'automation'
    | 'browser'
    | 'calendar'
    | 'code'
    | 'code-search'
    | 'command'
    | 'computer'
    | 'clarification'
    | 'document'
    | 'file-edit'
    | 'file-list'
    | 'file-read'
    | 'home'
    | 'image'
    | 'memory'
    | 'message'
    | 'skill'
    | 'task'
    | 'thinking'
    | 'tool'
    | 'voice'
    | 'web'
    | 'wiki'
    | 'subagent';

export interface ToolIntent {
    kind: ToolIntentKind;
    subject?: string;
    subjectVisibility?: 'drawer' | 'header';
}

export interface ToolIntentCopy {
    active: string;
    completed: string;
    plural?: string;
    priority: number;
}
