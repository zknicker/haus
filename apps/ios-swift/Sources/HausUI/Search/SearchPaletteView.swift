import SwiftUI

/// The Search tab: a glass field with a close circle, scope chips, then
/// Captains, Recent, and Actions until there is a query. A query filters the
/// authorized local lists and runs `chat.search` for messages.
struct SearchPaletteView: View {
    let chats: [ChatPresentation]
    let content: SearchPaletteContent
    let searchMessages: MessageSearch
    let searchRecoveryRevision: Int
    let actions: SearchPaletteActions
    var selection: SearchSelection?
    let onSelectChat: (ChatPresentation) -> Void
    /// Returns `false` when the result's Chat is no longer in the directory.
    let onSelectMessage: (MessageSearchResultPresentation) -> Bool

    @State var query = ""
    @State var scope: SearchScope?
    @State var search = MessageSearchRun()
    @State var retryToken = 0
    @State var selectionError: String?
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SearchPaletteField(query: $query, isFocused: $isFocused, onClose: close)
            FilterChipRow {
                ForEach(SearchScope.allCases, id: \.self) { candidate in
                    FilterChip(candidate.title, isSelected: scope == candidate) {
                        scope = scope == candidate ? nil : candidate
                    }
                }
            }
            TimelineView(.everyMinute) { timeline in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        sections(now: timeline.date)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.immediately)
                .overlay(alignment: .top) {
                    SearchProgressBadge(isSearching: search.isSearching)
                }
            }
        }
        .padding(.top, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(HausPlatformColor.canvas)
        .hausHiddenNavigationBar()
        .task(id: messageSearchKey) {
            await search.run(SearchPalette.searchesMessages(scope) ? query : "", chatID: nil, search: searchMessages)
        }
        .task { await actions.onAppear() }
        .carriesAcrossPoses($query, as: "searchQuery")
        .carriesAcrossPoses($scope, as: "searchScope")
        .alert("Couldn’t open that chat", isPresented: hasSelectionError) {
            Button("OK") { selectionError = nil }
        } message: {
            Text(selectionError ?? "Try again.")
        }
    }

    private var messageSearchKey: String {
        "\(query)|\(scope?.rawValue ?? "all")|\(retryToken)|\(searchRecoveryRevision)"
    }

    private var hasSelectionError: Binding<Bool> {
        Binding(get: { selectionError != nil }, set: { if !$0 { selectionError = nil } })
    }

    private func close() {
        query = ""
        scope = nil
        isFocused = false
        actions.onClose()
    }
}

#Preview("Search") {
    SearchPaletteView(
        chats: ChatFixtures.chats,
        content: SearchPaletteFixtures.content,
        searchMessages: { _, _ in [] },
        searchRecoveryRevision: 0,
        actions: .preview,
        onSelectChat: { _ in },
        onSelectMessage: { _ in true }
    )
}

#Preview("Search, accessibility size") {
    SearchPaletteView(
        chats: ChatFixtures.chats,
        content: SearchPaletteFixtures.content,
        searchMessages: { _, _ in [] },
        searchRecoveryRevision: 0,
        actions: .preview,
        onSelectChat: { _ in },
        onSelectMessage: { _ in true }
    )
    .dynamicTypeSize(.accessibility3)
}
