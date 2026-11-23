import HausModels
import SwiftUI

/// The effort drill-in for one model. Picking an effort writes the model and that effort together.
struct ModelEffortPicker: View {
    let presentation: ModelSheetPresentation
    let option: ModelSheetOption
    let onPick: (AgentReasoningEffort) -> Void

    var body: some View {
        let selected = Self.selectedEffort(in: presentation, for: option)
        List {
            Section {
                ForEach(Self.efforts(for: option), id: \.self) { effort in
                    Button {
                        onPick(effort)
                    } label: {
                        HStack {
                            Text(effort.displayName)
                                .font(HausFont.font(size: 17))
                                .foregroundStyle(HausTone.ink.color)
                            Spacer(minLength: 8)
                            if effort == selected {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(HausTone.accentInk.color)
                            }
                        }
                        .frame(minHeight: 44)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(effort == selected ? .isSelected : [])
                }
            }
        }
        .navigationTitle(option.model.label)
        .hausInlineNavigationTitle()
    }

    nonisolated static func efforts(for option: ModelSheetOption) -> [AgentReasoningEffort] {
        option.model.supportedReasoningEfforts.filter { $0 != .default }
    }

    /// The checked effort: the Captain's current one, only on the Captain's current model.
    nonisolated static func selectedEffort(
        in presentation: ModelSheetPresentation,
        for option: ModelSheetOption
    ) -> AgentReasoningEffort? {
        presentation.isCurrent(option) ? presentation.current?.reasoningEffort : nil
    }
}
