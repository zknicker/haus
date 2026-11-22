import SwiftUI

private struct MessageComposerPreview: View {
    let place: ComposerPlace
    var showsModel = false
    @State var text = ""
    @State private var interaction = ComposerInteraction()
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack {
            Spacer()
            MessageComposerView(
                text: $text,
                interaction: interaction,
                place: place,
                isTextFocused: $isFocused,
                model: showsModel
                    ? ComposerModelControl(presentation: ModelSheetFixtures.presentation()) { _ in }
                    : nil,
                onSend: { _, _ in true }
            )
        }
    }
}

#Preview("Captain DM") {
    MessageComposerPreview(place: .captain, showsModel: true)
}

#Preview("Project") {
    MessageComposerPreview(place: .project(name: "product"))
}

#Preview("Long draft") {
    MessageComposerPreview(
        place: .task,
        showsModel: true,
        text: "Draft the 28.1 notes in our usual shape: one line per target, then a short "
            + "\"what changed for you\" for each surface. Keep iPhone separate since it needs iOS 26 now."
    )
}
