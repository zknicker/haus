import SwiftUI

#Preview {
    @Previewable @State var draft = ""
    @Previewable @State var composerInteraction = ComposerInteraction()

    ChatScreenView(
        chat: .durableChat(ChatFixtures.chats[1]),
        messages: ChatFixtures.messages,
        draft: $draft,
        composerInteraction: composerInteraction,
        isConnected: true,
        onOpenSidebar: {},
        onOpenChatDetails: {},
        onOpenSearch: {},
        onOpenThread: { _ in },
        onSend: { _, _ in true }
    )
}

#Preview("Empty Chat") {
    @Previewable @State var draft = ""
    @Previewable @State var composerInteraction = ComposerInteraction()

    ChatScreenView(
        chat: .durableChat(ChatFixtures.chats[1]),
        messages: [],
        draft: $draft,
        composerInteraction: composerInteraction,
        isConnected: true,
        onOpenSidebar: {},
        onOpenChatDetails: {},
        onOpenSearch: {},
        onOpenThread: { _ in },
        onSend: { _, _ in true }
    )
}
