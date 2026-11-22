import HausModels
import SwiftUI

/// The Model sheet the composer's model chip opens: the Captain's model, searchable and grouped
/// by model connection, with an effort drill-in and a usage view behind the header button.
///
/// It writes through `onSelect`, which the caller sends as `agent.configure`. When the viewer
/// cannot configure, or configure was refused, the list is read-only.
public struct ModelSheet: View {
    private let presentation: ModelSheetPresentation
    private let onSelect: (AgentRuntimeConfiguration) -> Void

    @State private var query = ""
    @State private var path: [ModelSheetRoute] = []
    @Environment(\.dismiss) private var dismiss

    public init(
        presentation: ModelSheetPresentation,
        onSelect: @escaping (AgentRuntimeConfiguration) -> Void
    ) {
        self.presentation = presentation
        self.onSelect = onSelect
    }

    public var body: some View {
        NavigationStack(path: $path) {
            ModelSheetList(
                presentation: presentation,
                query: query,
                onPick: { option in commit(presentation.configuration(selecting: option)) },
                onOpenEffort: { option in path.append(.effort(option.id)) }
            )
            .modelSheetSearchable(text: $query)
            .navigationTitle("Model")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", systemImage: "xmark") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Usage", systemImage: "gauge.with.dots.needle.33percent") {
                        path.append(.usage)
                    }
                }
            }
            .navigationDestination(for: ModelSheetRoute.self) { route in
                destination(route)
            }
        }
    }

    @ViewBuilder
    private func destination(_ route: ModelSheetRoute) -> some View {
        switch route {
        case .effort(let optionID):
            if let option = presentation.groups.lazy.flatMap(\.options).first(where: { $0.id == optionID }) {
                ModelEffortPicker(presentation: presentation, option: option) { effort in
                    commit(presentation.configuration(selecting: option, effort: effort))
                }
            }
        case .usage:
            ModelUsageView(groups: presentation.groups)
        }
    }

    private func commit(_ configuration: AgentRuntimeConfiguration) {
        guard presentation.isConfigurable else { return }
        if configuration != presentation.current { onSelect(configuration) }
        dismiss()
    }
}

enum ModelSheetRoute: Hashable {
    case effort(ModelSheetOption.ID)
    case usage
}

private extension View {
    func modelSheetSearchable(text: Binding<String>) -> some View {
        #if os(iOS)
        searchable(text: text, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search models")
        #else
        searchable(text: text, prompt: "Search models")
        #endif
    }
}
