import { registerChatViewModule } from '../../features/servers/chat/chat-view-module.ts';
import { ChatView } from '../../features/servers/chat/chat-view.tsx';

registerChatViewModule({ ChatView });

export { ChatView };
