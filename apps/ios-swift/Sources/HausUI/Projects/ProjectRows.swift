import SwiftUI

/// A Project as a plain 60pt row: its glyph in the shared ``ListLead``
/// column, its name over its Captains and open Task count, and when it last
/// moved with the unread dot.
struct ProjectRow: View {
    let row: ProjectRowPresentation
    let now: Date

    @ScaledMetric(relativeTo: .subheadline) private var markSide: CGFloat = 16

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            lead.listLeadSlot()
            VStack(alignment: .leading, spacing: 3) {
                Text(row.name)
                    .font(.body)
                    .foregroundStyle(HausPlatformColor.ink)
                    .lineLimit(1)
                meta
            }
            Spacer(minLength: 12)
            ListTrailing(
                time: row.lastActivityAt.map { HausCompactRelativeTime.label(for: $0, now: now) },
                isUnread: row.isUnread
            )
        }
        .padding(.vertical, 8)
        .frame(minHeight: 60, alignment: .top)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityValue(row.isUnread ? "Unread" : "")
    }

    @ViewBuilder
    private var lead: some View {
        if row.isAll {
            ListLeadSymbol(systemName: "person.2")
        } else {
            ChannelGlyph(appearance: row.appearance, size: ListLead.glyphSize)
        }
    }

    @ViewBuilder
    private var meta: some View {
        let marks = row.isAll ? [] : Array(row.captains.prefix(4))
        if !marks.isEmpty || row.meta != nil {
            HStack(spacing: 6) {
                if !marks.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(marks) { CaptainFaceMark(captain: $0, side: markSide) }
                    }
                }
                if let meta = row.meta {
                    Text(meta).lineLimit(1)
                }
            }
            .font(.subheadline)
            .foregroundStyle(HausPlatformColor.mutedInk)
        }
    }
}

/// A person's DM in the People section.
struct PersonRow: View {
    let row: PersonRowPresentation

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            AvatarView(name: row.name, url: row.avatarURL, size: ListLead.markSide)
                .frame(width: ListLead.width, alignment: .leading)
            Text(row.name)
                .font(.body)
                .foregroundStyle(HausPlatformColor.ink)
                .lineLimit(1)
            Spacer(minLength: 12)
            Text("DM")
                .font(.subheadline)
                .foregroundStyle(HausPlatformColor.mutedInk)
            ListUnreadDot()
                .opacity(row.isUnread ? 1 : 0)
                .padding(.leading, 8)
        }
        .frame(minHeight: 52)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityValue(row.isUnread ? "Unread" : "")
    }
}

/// The Archived row: a folder glyph, the count, and a chevron.
struct ArchivedProjectsRow: View {
    let count: Int?

    var body: some View {
        HStack(spacing: 0) {
            ListLeadSymbol(systemName: "folder")
                .frame(width: ListLead.width, alignment: .leading)
            Text("Archived")
                .font(.body)
                .foregroundStyle(HausPlatformColor.ink)
            Spacer(minLength: 12)
            if let count {
                Text(count, format: .number)
                    .font(.subheadline)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .monospacedDigit()
                    .padding(.trailing, 8)
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HausPlatformColor.faintInk)
                .accessibilityHidden(true)
        }
        .frame(minHeight: 52)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}
