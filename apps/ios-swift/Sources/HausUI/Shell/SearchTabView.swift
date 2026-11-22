import SwiftUI

/// Server search as a tab root (the Search tab) or a sheet scoped to one Chat
/// (a chat header's search button). Results open through the App's router.
public struct SearchTabView: View {
    private let chats: [ChatPresentation]
    private let scopeChat: ChatPresentation?
    private let searchMessages: MessageSearch
    private let searchRecoveryRevision: Int
    private let isTabRoot: Bool
    private let onSelectChat: (ChatPresentation) -> Void
    private let onSelectMessage: (MessageSearchResultPresentation) -> Void

    public init(
        chats: [ChatPresentation],
        scopeChat: ChatPresentation? = nil,
        searchMessages: @escaping MessageSearch,
        searchRecoveryRevision: Int,
        isTabRoot: Bool,
        onSelectChat: @escaping (ChatPresentation) -> Void,
        onSelectMessage: @escaping (MessageSearchResultPresentation) -> Void
    ) {
        self.chats = chats
        self.scopeChat = scopeChat
        self.searchMessages = searchMessages
        self.searchRecoveryRevision = searchRecoveryRevision
        self.isTabRoot = isTabRoot
        self.onSelectChat = onSelectChat
        self.onSelectMessage = onSelectMessage
    }

    public var body: some View {
        ServerSearchView(
            chats: chats,
            scopeChat: scopeChat,
            searchMessages: searchMessages,
            searchRecoveryRevision: searchRecoveryRevision,
            onSelectChat: onSelectChat,
            onSelectMessage: { result in
                guard chats.contains(where: { $0.id == result.chatID }) else { return false }
                onSelectMessage(result)
                return true
            },
            isTabRoot: isTabRoot
        )
    }
}
