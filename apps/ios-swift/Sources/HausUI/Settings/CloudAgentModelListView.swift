import SwiftUI
import HausModels

/// The pushed Model list: Cursor default, then one section per family in
/// Cursor's order, searchable by name or id. Picking a row saves and returns.
struct CloudAgentModelListView: View {
    let choice: CloudAgentModelChoice
    let select: (CloudAgentModelSetting) -> Void
    @State private var query = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let sections = choice.sections(matching: query)
        List {
            ForEach(sections) { section in
                Section {
                    ForEach(section.options) { row($0) }
                } header: {
                    if let title = section.title { Text(title) }
                }
            }
            if query.isEmpty, let unavailableModelID = choice.unavailableModelID {
                Section {
                    row(CloudAgentModelChoice.Option(
                        setting: .model(id: unavailableModelID, params: .modelDefaults),
                        name: unavailableModelID,
                        detail: nil
                    ))
                } header: {
                    Text("Unavailable")
                } footer: {
                    Text("Cursor no longer lists this model, so runs use Cursor default.")
                }
            }
        }
        .overlay {
            if sections.isEmpty { ContentUnavailableView.search(text: query) }
        }
        .modelSearchable(text: $query)
        .navigationTitle("Model")
        .hausInlineNavigationTitle()
    }

    private func row(_ option: CloudAgentModelChoice.Option) -> some View {
        let isSelected = choice.isSelected(option)
        return Button {
            choice.setting(selecting: option).map(select)
            dismiss()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    // Explicit colors: a List button tints hierarchical styles.
                    // Names wrap at words; they never truncate.
                    Text(option.name)
                        .foregroundStyle(Color.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let detail = option.detail {
                        Text(detail).font(.subheadline).foregroundStyle(Color.secondary)
                    }
                }
                Spacer(minLength: 8)
                if isSelected {
                    Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(.tint)
                }
            }
            .contentShape(Rectangle())
        }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private extension View {
    /// Always-visible search: 40-odd models are a list people search, not scroll.
    func modelSearchable(text: Binding<String>) -> some View {
        #if os(iOS)
        searchable(text: text, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search models")
        #else
        searchable(text: text, prompt: "Search models")
        #endif
    }
}
