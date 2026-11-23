import SwiftUI

/// The leading column every plain list row shares, so titles start on one edge
/// whether a row leads with a Task disc, a Channel glyph, a Captain, a person,
/// or a Worker. It matches `WorkerRow` and `WorkListRow`, whose glyph and gap
/// come to the same 28pt.
enum ListLead {
    static let width: CGFloat = 28
    /// A Captain's or a person's mark in the column.
    static let markSide: CGFloat = 20
    /// A borderless glyph in the column: a Channel, People, Archived.
    static let glyphSize: CGFloat = 18
    /// The height of the 17pt title's first line, which the lead centers on.
    static let titleLineHeight: CGFloat = 22
}

extension View {
    /// Seats a row's lead in the shared column, centered on the title's first line.
    func listLeadSlot() -> some View {
        frame(width: ListLead.width, height: ListLead.titleLineHeight, alignment: .leading)
    }
}

/// A borderless SF Symbol in the ``ListLead`` column, in the muted ink.
struct ListLeadSymbol: View {
    let systemName: String

    var body: some View {
        Image(systemName: systemName)
            .resizable()
            .scaledToFit()
            .frame(width: ListLead.glyphSize, height: ListLead.glyphSize - 2)
            .foregroundStyle(HausPlatformColor.mutedInk)
            .accessibilityHidden(true)
    }
}

/// A row's trailing time over a fixed unread slot, so times on read and
/// unread rows end on the same edge.
struct ListTrailing: View {
    let time: String?
    let isUnread: Bool

    var body: some View {
        HStack(spacing: 8) {
            if let time {
                Text(time)
                    .font(.subheadline)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .monospacedDigit()
            }
            ListUnreadDot().opacity(isUnread ? 1 : 0)
        }
        .frame(height: ListLead.titleLineHeight)
    }
}
