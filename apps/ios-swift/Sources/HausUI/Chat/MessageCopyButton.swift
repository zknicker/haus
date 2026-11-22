import SwiftUI

/// The quiet copy glyph under a Captain's reply in the assistant layout.
struct MessageCopyButton: View {
    let message: MessagePresentation
    @State private var copies = 0

    static let glyphSize: CGFloat = 17

    var body: some View {
        Button {
            MessageClipboard.copy(message)
            copies += 1
        } label: {
            Image(systemName: "square.on.square")
                .font(.system(size: Self.glyphSize - 3))
                .foregroundStyle(HausPlatformColor.faintInk)
                .frame(width: 32, height: 28, alignment: .leading)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.success, trigger: copies)
        .accessibilityLabel("Copy message")
    }
}
