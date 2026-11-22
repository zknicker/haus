import SwiftUI

/// Server search as a tab root (the Search tab's palette) or a sheet scoped to
/// one Chat (a chat header's search button). Results open through the App's router.
public struct SearchTabView: View {
    private let chats: [ChatPresentation]
    private let scopeChat: ChatPresentation?
    private let searchMessages: MessageSearch
    private let searchRecoveryRevision: Int
    private let isTabRoot: Bool
    private let palette: SearchPaletteContent
    private let actions: SearchPaletteActions?
    private let onSelectChat: (ChatPresentation) -> Void
    private let onSelectMessage: (MessageSearchResultPresentation) -> Void

    /// - Parameters:
    ///   - palette: the authorized lists the tab's scopes filter.
    ///   - actions: the tab's rows and actions; a tab root without them shows the sheet.
    public init(
        chats: [ChatPresentation],
        scopeChat: ChatPresentation? = nil,
        searchMessages: @escaping MessageSearch,
        searchRecoveryRevision: Int,
        isTabRoot: Bool,
        palette: SearchPaletteContent = .empty,
        actions: SearchPaletteActions? = nil,
        onSelectChat: @escaping (ChatPresentation) -> Void,
        onSelectMessage: @escaping (MessageSearchResultPresentation) -> Void
    ) {
        self.chats = chats
        self.scopeChat = scopeChat
        self.searchMessages = searchMessages
        self.searchRecoveryRevision = searchRecoveryRevision
        self.isTabRoot = isTabRoot
        self.palette = palette
        self.actions = actions
        self.onSelectChat = onSelectChat
        self.onSelectMessage = onSelectMessage
    }

    public var body: some View {
        if isTabRoot, let actions {
            NavigationStack {
                SearchPaletteView(
                    chats: chats,
                    content: palette,
                    searchMessages: searchMessages,
                    searchRecoveryRevision: searchRecoveryRevision,
                    actions: actions,
                    onSelectChat: onSelectChat,
                    onSelectMessage: openMessage
                )
            }
        } else {
            ServerSearchView(
                chats: chats,
                scopeChat: scopeChat,
                searchMessages: searchMessages,
                searchRecoveryRevision: searchRecoveryRevision,
                onSelectChat: onSelectChat,
                onSelectMessage: openMessage
            )
        }
    }

    private func openMessage(_ result: MessageSearchResultPresentation) -> Bool {
        guard chats.contains(where: { $0.id == result.chatID }) else { return false }
        onSelectMessage(result)
        return true
    }
}
