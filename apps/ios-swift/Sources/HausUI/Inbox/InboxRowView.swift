import SwiftUI

/// One Inbox row, exactly one line tall, in the email-inbox grammar the App's
/// own rows use: a 32pt leading mark, the title that keeps its own width, the
/// muted preview that gives way first, and a trailing cluster that never
/// shrinks.
///
/// No row carries a control, so the whole row is the press target and every row
/// in the column ends on the same right edge.
struct InboxRowView<Trailing: View>: View {
    let mark: InboxMark
    let title: String
    let preview: String
    let onOpen: () -> Void
    @ViewBuilder var trailing: Trailing

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 10) {
                InboxMarkView(mark: mark)

                HStack(spacing: 6) {
                    // The title is what the eye scans, so it takes the width it
                    // needs first and a short one leaves the rest to the
                    // preview. What stops a long one from taking the whole line
                    // is the preview's own floor below — the phone's read of the
                    // App's 40% title cap, stated from the other side so the
                    // preview always starts right after the title.
                    Text(title)
                        .lineLimit(1)
                        .layoutPriority(1)
                    Text(preview)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(
                            minWidth: InboxMetrics.previewFloor,
                            maxWidth: .infinity,
                            alignment: .leading
                        )
                }

                trailing
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .layoutPriority(2)
            }
            .font(.subheadline)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, InboxMetrics.rowInset)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow(cornerRadius: InboxMetrics.boxRadius))
        .accessibilityLabel(title)
    }
}

extension InboxRowView where Trailing == EmptyView {
    init(mark: InboxMark, title: String, preview: String, onOpen: @escaping () -> Void) {
        self.init(mark: mark, title: title, preview: preview, onOpen: onOpen) { EmptyView() }
    }
}

/// One identity grammar for every Inbox row: an Agent's own face, a Channel's
/// icon box, or a Cloud Agent provider glyph in the same mark column.
struct InboxMarkView: View {
    let mark: InboxMark

    var body: some View {
        switch mark {
        case .identity(let name, let avatarURL, let presence):
            AvatarView(name: name, url: avatarURL, presence: presence, size: inboxMarkSize)
        case .channel(let appearance):
            ChannelIconBox(appearance: appearance, size: inboxMarkSize)
        case .cloudAgent:
            CloudAgentMark(size: inboxMarkSize, style: .glyph)
        }
    }
}

/// One left edge for every line on the page: the greeting, the section labels,
/// and each row's mark all start here.
enum InboxMetrics {
    static let pageInset: CGFloat = 20
    static let rowInset: CGFloat = 14
    static let boxRadius: CGFloat = 14
    /// The width a preview keeps whatever the title does. It is the App's 40%
    /// title cap read from the other side: a long title truncates once the
    /// preview would drop below this, so no row is a title alone.
    static let previewFloor: CGFloat = 64
}
