import SwiftUI

/// The staged attachments above the expanded composer's text, with a spinner while one prepares.
struct ComposerAttachmentStrip: View {
    let interaction: ComposerInteraction
    /// True when the screen owns a transition namespace, so a landing photo flies into its tile.
    let runsFlight: Bool
    let onRemove: (ComposerAttachment) -> Void

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 4) {
                ForEach(interaction.attachments) { attachment in
                    tile(attachment)
                }
                if interaction.isPreparingAttachment {
                    ProgressView()
                        .frame(width: 88, height: 88)
                        .background(.quaternary, in: .rect(cornerRadius: 14))
                        .accessibilityLabel("Preparing attachment")
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    /// Only the landing tile hides itself and reports where the flying photo has to arrive, for as
    /// long as the flight lasts: the tile keeps moving while the composer grows the strip around it.
    private func tile(_ attachment: ComposerAttachment) -> some View {
        let isFlightDestination = runsFlight && interaction.morphingAttachmentID == attachment.id
        return ComposerAttachmentTile(attachment: attachment) {
            onRemove(attachment)
        }
        .opacity(isFlightDestination ? 0 : 1)
        .background {
            if isFlightDestination {
                GeometryReader { geometry in
                    Color.clear
                        .onAppear { reportDestinationFrame(geometry) }
                        .onChange(of: geometry.frame(in: .global)) { _, _ in
                            reportDestinationFrame(geometry)
                        }
                }
            }
        }
    }

    private func reportDestinationFrame(_ geometry: GeometryProxy) {
        interaction.morphDestinationFrame = geometry.frame(in: .global)
    }
}
