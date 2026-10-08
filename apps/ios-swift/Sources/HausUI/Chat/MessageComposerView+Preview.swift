import SwiftUI

private struct MessageComposerPreview: View {
    @State private var text = ""
    @State private var interaction = ComposerInteraction()
    @FocusState private var isFocused: Bool

    var body: some View {
        MessageComposerView(
            text: $text,
            interaction: interaction,
            placeholder: "Message #product",
            isTextFocused: $isFocused,
            onSend: { _, _ in true }
        )
    }
}

#Preview {
    MessageComposerPreview()
}
