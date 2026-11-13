import SwiftUI

/// The line under the feed after acting on an item, with its Undo. It floats
/// over the page rather than joining it, so the rows never move to make room.
struct InboxTaskNoticeBar: View {
    let notice: InboxTaskNotice
    let onUndo: (InboxTaskUndo) -> Void

    var body: some View {
        HStack(spacing: 10) {
            Text(notice.message)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let undo = notice.undo {
                Button("Undo") { onUndo(undo) }
                    .font(.subheadline.weight(.semibold))
                    .buttonStyle(.borderless)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: HausRadius.medium, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}
