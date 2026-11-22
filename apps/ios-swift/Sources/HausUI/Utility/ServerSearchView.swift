import Foundation
import SwiftUI

/// Search narrowed to one Chat, as a sheet from a chat header: chats resolve
/// locally from the Store cache while messages resolve through the Server.
/// Search work is injected so the view stays independent from tRPC,
/// authentication, and the App's cache policy.
///
/// The field is focused the moment the sheet opens, so the keyboard is already
/// up when it lands. Opened from inside a Chat, the sheet also offers that Chat
/// as a narrower scope, using the Server search's own Chat filter.
struct ServerSearchView: View {
    @Environment(\.dismiss) private var dismiss

    private let chats: [ChatPresentation]
    /// The Chat the sheet was opened from, offered as a scope.
    private let scopeChat: ChatPresentation?
    private let searchMessages: MessageSearch
    /// The Store advances this only after a committed Agent message. A mounted
    /// non-empty query then reruns; an unmounted sheet owns no search work.
    private let searchRecoveryRevision: Int
    private let onSelectChat: (ChatPresentation) -> Void
    /// Returns `false` when the result's Chat is no longer in the directory, so
    /// the sheet can report the failure instead of dismissing into nothing.
    private let onSelectMessage: (MessageSearchResultPresentation) -> Bool

    @State private var query = ""
    @State private var scope = ServerSearchScope.everywhere
    @State private var isSearchPresented = false
    @State private var selectionError: String?
    @State private var search = MessageSearchRun()
    @State private var retryToken = 0

    init(
        chats: [ChatPresentation],
        scopeChat: ChatPresentation? = nil,
        searchMessages: @escaping MessageSearch,
        searchRecoveryRevision: Int = 0,
        onSelectChat: @escaping (ChatPresentation) -> Void,
        onSelectMessage: @escaping (MessageSearchResultPresentation) -> Bool
    ) {
        self.chats = chats
        self.scopeChat = scopeChat
        self.searchMessages = searchMessages
        self.searchRecoveryRevision = searchRecoveryRevision
        self.onSelectChat = onSelectChat
        self.onSelectMessage = onSelectMessage
    }

    var body: some View {
        NavigationStack {
            searchableContent
#if os(iOS)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
#endif
                .navigationTitle("Search")
                .hausInlineNavigationTitle()
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close", systemImage: "xmark") { dismiss() }
                    }
                }
                .alert("Couldn’t open that chat", isPresented: hasSelectionError) {
                    Button("OK") { selectionError = nil }
                } message: {
                    Text(selectionError ?? "Try again.")
                }
        }
        .task(id: "\(query)|\(scope)|\(retryToken)|\(searchRecoveryRevision)") {
            await search.run(query, chatID: scopedChatID, search: searchMessages)
        }
        // Raising the field in the sheet's first turn is too early for the
        // navigation bar to own it; one turn later the keyboard comes up as
        // the sheet lands.
        .task { isSearchPresented = true }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HausPlatformColor.groupedBackground)
    }

    @ViewBuilder
    private var searchableContent: some View {
        let searchable = content.searchable(
            text: $query,
            isPresented: $isSearchPresented,
            prompt: prompt
        )
        if let scopeChat {
            searchable.searchScopes($scope, activation: .onSearchPresentation) {
                Text("Everywhere").tag(ServerSearchScope.everywhere)
                Text(scopeLabel(scopeChat)).tag(ServerSearchScope.chat)
            }
        } else {
            searchable
        }
    }

    private var prompt: String {
        if scope == .chat, let scopeChat { return "Search \(scopeLabel(scopeChat))" }
        return "Projects, Captains, and messages"
    }

    private func scopeLabel(_ chat: ChatPresentation) -> String {
        if case .channel = chat.kind { return "#\(chat.title)" }
        return chat.title
    }

    private var scopedChatID: String? {
        scope == .chat ? scopeChat?.id : nil
    }

    private var hasSelectionError: Binding<Bool> {
        Binding(
            get: { selectionError != nil },
            set: { if !$0 { selectionError = nil } }
        )
    }

    /// A search narrowed to one Chat is a search of its messages; its name
    /// matching itself would only offer the Chat the reader is already in.
    private var chatMatches: [ChatPresentation] {
        scopedChatID == nil ? ServerSearch.matchingChats(chats, query: query) : []
    }

    @ViewBuilder
    private var content: some View {
        if search.results.isEmpty, chatMatches.isEmpty, let searchError = search.error {
            ContentUnavailableView {
                Label("Search unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(searchError)
            } actions: {
                Button("Try again") { retryToken += 1 }
                    .buttonStyle(.borderedProminent)
            }
        } else if search.results.isEmpty, chatMatches.isEmpty {
            ZStack(alignment: .top) {
                if search.hasSearched {
                    ContentUnavailableView(
                        "No matches",
                        systemImage: "text.magnifyingglass",
                        description: Text(scopedChatID == nil
                            ? "Try a project, a Captain name, or a different phrase."
                            : "Try a different phrase, or search everywhere.")
                    )
                } else if query.isEmpty {
                    ContentUnavailableView(
                        "Search Haus",
                        systemImage: "magnifyingglass",
                        description: Text("Find a project or Captain, or a message anyone has sent.")
                    )
                }
                SearchProgressBadge(isSearching: search.isSearching)
            }
        } else {
            ZStack(alignment: .top) {
                resultList
                SearchProgressBadge(isSearching: search.isSearching)
                if let searchError = search.error {
                    SearchErrorBanner(message: searchError) { retryToken += 1 }
                }
            }
        }
    }

    private var resultList: some View {
        List {
            if !chatMatches.isEmpty {
                Section("Chats") {
                    ForEach(chatMatches) { chat in
                        Button {
                            onSelectChat(chat)
                        } label: {
                            ChatSearchResultRow(chat: chat, query: query)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(searchRowInsets)
                    }
                }
            }

            if !search.results.isEmpty {
                Section("Messages") {
                    ForEach(search.results) { result in
                        Button {
                            guard onSelectMessage(result) else {
                                selectionError = "That message’s chat is no longer in this Server."
                                return
                            }
                        } label: {
                            MessageSearchResultRow(result: result, query: query)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(searchRowInsets)
                    }
                }
            }
        }
#if os(iOS)
        .listStyle(.insetGrouped)
#else
        .listStyle(.inset)
#endif
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.immediately)
        .background(HausPlatformColor.groupedBackground)
    }
}

/// The small capsule that shows a message search is in flight.
struct SearchProgressBadge: View {
    let isSearching: Bool

    var body: some View {
        if isSearching {
            ProgressView()
                .controlSize(.small)
                .padding(8)
                .background(.regularMaterial, in: .capsule)
                .accessibilityLabel("Searching")
                .padding(.top, 10)
        }
    }
}

/// Message search failed while local matches still show: say so, and retry.
struct SearchErrorBanner: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Label("Messages unavailable", systemImage: "exclamationmark.triangle")
                .lineLimit(1)
            Spacer(minLength: 4)
            Button("Retry", action: retry)
                .font(.caption.weight(.semibold))
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: .capsule)
        .padding(.top, 10)
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Messages unavailable: \(message)")
    }
}
