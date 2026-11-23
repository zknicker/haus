import HausModels
import SwiftUI

/// The Model sheet's list: one card per model connection, headed by its mark, name, and how much
/// capacity it has left.
struct ModelSheetList: View {
    let presentation: ModelSheetPresentation
    let query: String
    let onPick: (ModelSheetOption) -> Void
    let onOpenEffort: (ModelSheetOption) -> Void

    var body: some View {
        let groups = presentation.groups(matching: query)
        List {
            ForEach(groups) { group in
                Section {
                    ForEach(group.options) { option in
                        ModelSheetRow(
                            option: option,
                            provider: group.provider,
                            isCurrent: presentation.isCurrent(option),
                            effortLabel: presentation.effortLabel(for: option),
                            isConfigurable: presentation.isConfigurable,
                            onPick: { onPick(option) },
                            onOpenEffort: { onOpenEffort(option) }
                        )
                    }
                } header: {
                    ModelSheetGroupHeader(group: group)
                } footer: {
                    if group.id == groups.last?.id {
                        Text(presentation.footer)
                    }
                }
            }
        }
        .modelSheetListStyle()
        .overlay {
            if groups.isEmpty {
                if query.isEmpty {
                    ContentUnavailableView(
                        "No Models",
                        systemImage: "cpu",
                        description: Text("Connect a model in Models & connections.")
                    )
                } else {
                    ContentUnavailableView.search(text: query)
                }
            }
        }
    }
}

private struct ModelSheetGroupHeader: View {
    let group: ModelSheetGroup

    var body: some View {
        HStack(spacing: 8) {
            ModelProviderMark(provider: group.provider, size: 13, isTinted: true)
            Text(group.title)
                .foregroundStyle(HausTone.mutedInk.color)
            if let capacityLine = group.capacityLine {
                Text(capacityLine)
                    .foregroundStyle(HausTone.faintInk.color)
            }
        }
        .font(HausFont.font(size: 15))
        .textCase(nil)
        .accessibilityElement(children: .combine)
    }
}

private struct ModelSheetRow: View {
    let option: ModelSheetOption
    let provider: ModelProvider
    let isCurrent: Bool
    let effortLabel: String?
    let isConfigurable: Bool
    let onPick: () -> Void
    let onOpenEffort: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            if isConfigurable {
                Button(action: onPick) { content }
                    .buttonStyle(.plain)
                if option.offersEffortChoice {
                    Button(action: onOpenEffort) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(HausTone.faintInk.color)
                            .frame(width: 32, height: 44, alignment: .trailing)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(option.model.label) effort")
                }
            } else {
                content
            }
        }
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }

    private var content: some View {
        HStack(spacing: 14) {
            ModelProviderMark(provider: provider, size: 17)
                .frame(width: 22)
            Text(option.model.label)
                .font(HausFont.font(size: 17))
                .foregroundStyle(HausTone.ink.color)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if let effortLabel {
                Text(effortLabel)
                    .font(HausFont.font(size: 17))
                    .foregroundStyle(HausTone.mutedInk.color)
            }
            if isCurrent {
                Image(systemName: "checkmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(HausTone.accentInk.color)
            }
        }
        .frame(minHeight: 44)
        .contentShape(.rect)
    }
}

extension View {
    func modelSheetListStyle() -> some View {
        #if os(iOS)
        listStyle(.insetGrouped)
        #else
        self
        #endif
    }
}
