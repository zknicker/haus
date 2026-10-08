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

extension View {
    /// Why a picked file could not join the draft, as a native alert. The
    /// message clears when the alert is dismissed.
    func composerAttachmentAlert(message: Binding<String?>) -> some View {
        alert(
            "Couldn’t Add Attachment",
            isPresented: Binding(
                get: { message.wrappedValue != nil },
                set: { if !$0 { message.wrappedValue = nil } }
            ),
            presenting: message.wrappedValue
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { text in
            Text(text)
        }
    }
}
