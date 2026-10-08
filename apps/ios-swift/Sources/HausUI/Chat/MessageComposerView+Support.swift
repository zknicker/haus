import SwiftUI

extension MessageComposerView {
    /// Deliberately blind to the portal: the plus button on a collapsed composer opens the source
    /// menu over the pill without expanding it, and a portal opened from a focused composer keeps
    /// its keyboard — so focus alone holds the expanded shell for the portal's whole lifecycle.
    static func shouldExpand(
        isFocused: Bool,
        hasAttachments: Bool,
        isPreparingAttachment: Bool
    ) -> Bool {
        isFocused || hasAttachments || isPreparingAttachment
    }
}

/// The composer no longer sits on an opaque band, so a send failure carries its own surface
/// rather than laying red text straight over the transcript running underneath.
struct ComposerErrorNotice: View {
    let message: String

    var body: some View {
        let label = Text(message)
            .font(.caption)
            .foregroundStyle(.red)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
        if #available(iOS 26, macOS 26, *) {
            label.glassEffect(.regular, in: .rect(cornerRadius: 14))
        } else {
            label.background(.thinMaterial, in: .rect(cornerRadius: 14))
        }
    }
}
