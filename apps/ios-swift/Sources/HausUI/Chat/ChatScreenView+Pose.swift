import SwiftUI

/// What a Chat screen keeps across a pose change (`PoseCarry`): the reply it
/// is composing, the model sheet, and the composer's focus. The draft and its
/// target are the Store's already, and the transcript carries its own anchor.
extension View {
    func carriesPose(of screen: ChatScreenView, composerKey: String?) -> some View {
        carriesAcrossPoses(screen.$inlineReply, as: "inlineReply")
            .carriesAcrossPoses(screen.$isModelSheetPresented, as: "modelSheet")
            .carriesAcrossPoses(screen.isComposerFocused, as: "composerFocus", key: .composerFocus(composerKey)) {
                screen.isComposerFocused = $0
            }
    }
}
