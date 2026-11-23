import HausModels
import SwiftUI

/// What the composer's model chip needs: the Model sheet's content, and how to write the
/// Captain's model (`agent.configure`, which rotates the Captain's session).
public struct ComposerModelControl {
    public let presentation: ModelSheetPresentation
    public let onSelect: (AgentRuntimeConfiguration) -> Void

    public init(
        presentation: ModelSheetPresentation,
        onSelect: @escaping (AgentRuntimeConfiguration) -> Void
    ) {
        self.presentation = presentation
        self.onSelect = onSelect
    }
}

/// The "✳ Opus 5.5 ⌄" chip in the expanded composer's toolbar. It opens the Model sheet at the
/// medium detent.
struct ComposerModelChip: View {
    let control: ComposerModelControl

    @State private var isSheetPresented = false
    @ScaledMetric(relativeTo: .subheadline) private var height: CGFloat = 30

    var body: some View {
        let presentation = control.presentation
        Button {
            isSheetPresented = true
        } label: {
            HStack(spacing: 6) {
                if let provider = presentation.chipProvider {
                    ModelProviderMark(provider: provider, size: 13, isTinted: true)
                }
                Text(presentation.chipTitle)
                    .hausFont(.composerChip)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .hausFont(.workPillChevron)
                    .foregroundStyle(HausTone.faintInk.color)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 10)
            .frame(height: height)
            .foregroundStyle(HausTone.ink.color)
            .background(HausTone.fill.color, in: .capsule)
            .contentShape(.capsule)
        }
        .buttonStyle(.pressable)
        .accessibilityLabel("Model")
        .accessibilityValue(presentation.chipTitle)
        .sheet(isPresented: $isSheetPresented) {
            ModelSheet(presentation: presentation, onSelect: control.onSelect)
                .presentationDetents([.medium, .large])
        }
    }
}

extension HausTextRole {
    static let composerChip = HausTextRole(size: 15, weight: .medium, textStyle: .subheadline)
}
