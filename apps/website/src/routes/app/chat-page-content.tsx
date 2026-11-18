import { registerChatViewModule } from '../../features/servers/chat/chat-view-module.ts';
import { ChatView } from '../../features/servers/chat/chat-view.tsx';
import { ImplicitAgentDmPage } from '../../features/servers/chat/implicit-agent-dm-page.tsx';

registerChatViewModule({ ChatView, ImplicitAgentDmPage });

export { ChatView, ImplicitAgentDmPage };
