import { ChatView } from '../../features/servers/chat/chat-view.tsx';
import { registerChatViewModule } from '../../features/servers/chat/chat-view-module.ts';
import { ImplicitAgentDmPage } from '../../features/servers/chat/implicit-agent-dm-page.tsx';

registerChatViewModule({ ChatView, ImplicitAgentDmPage });

export { ChatView, ImplicitAgentDmPage };
