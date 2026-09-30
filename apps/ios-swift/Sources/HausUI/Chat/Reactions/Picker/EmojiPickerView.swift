import SwiftUI

#if os(iOS)

/// The drawer's full emoji picker: a search field on the ordinary keyboard,
/// then "Frequently used" and every category in one scrolling grid, with a
/// category bar along the bottom.
struct EmojiPickerView: View {
    let catalog: EmojiCatalog
    let onPick: (String) -> Void
    let onBack: () -> Void
    /// Built once: the grid's rows are the catalog's, and rebuilding them on
    /// every category change would redo it for nothing.
    private let sections: [EmojiGridSection]

    init(catalog: EmojiCatalog, frequent: [String], onPick: @escaping (String) -> Void, onBack: @escaping () -> Void) {
        self.catalog = catalog
        self.onPick = onPick
        self.onBack = onBack
        sections = [EmojiGridSection(id: EmojiGridSection.frequentID, title: "Frequently used", emoji: Array(frequent.prefix(16)))]
            + catalog.categories.map { EmojiGridSection(id: $0.id, title: $0.name, emoji: $0.entries.map(\.emoji)) }
    }

    @State private var query = ""
    @State private var jump: EmojiGridJump?
    @State private var currentSection = EmojiGridSection.frequentID
    @FocusState private var isSearching: Bool

    var body: some View {
        VStack(spacing: 0) {
            searchBar
                .padding(.horizontal, 16)
                .padding(.top, 20)
                .padding(.bottom, 8)
            if query.isEmpty {
                EmojiGrid(
                    sections: sections,
                    catalog: catalog,
                    jump: jump,
                    currentSection: $currentSection,
                    onPick: onPick
                )
                EmojiCategoryBar(
                    sections: sections,
                    current: currentSection,
                    onSelect: { id in jump = EmojiGridJump(sectionID: id) }
                )
            } else {
                searchResults
            }
        }
    }

    @ViewBuilder
    private var searchResults: some View {
        let results = catalog.search(query)
        if results.isEmpty {
            ContentUnavailableView.search(text: query)
                .frame(maxHeight: .infinity, alignment: .top)
                .padding(.top, 24)
        } else {
            EmojiGrid(
                sections: [EmojiGridSection(id: "results", title: nil, emoji: results.map(\.emoji))],
                catalog: catalog,
                jump: nil,
                currentSection: .constant("results"),
                onPick: onPick
            )
        }
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            Button(action: onBack) {
                Image(systemName: "chevron.backward")
                    .font(.body.weight(.semibold))
                    .frame(width: 32, height: 36)
                    .contentShape(.rect)
            }
            .foregroundStyle(.secondary)
            .accessibilityLabel("Back to actions")
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                TextField("Find the perfect reaction", text: $query)
                    .focused($isSearching)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                if !query.isEmpty {
                    Button { query = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 36)
            .background(HausPlatformColor.inputSurface, in: .rect(cornerRadius: 10, style: .continuous))
        }
    }
}

/// A request to scroll the grid to a section, keyed so the same tab can be
/// pressed twice.
struct EmojiGridJump: Equatable {
    let sectionID: String
    let token = UUID()
}

struct EmojiGridSection: Identifiable, Equatable {
    static let frequentID = "frequent"

    let id: String
    let title: String?
    let emoji: [String]
}
#endif
