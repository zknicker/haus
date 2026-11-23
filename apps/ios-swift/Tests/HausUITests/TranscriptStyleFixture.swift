import Foundation
@testable import HausUI

/// A long Captain conversation: turns of one person message and one or two
/// Captain replies, twenty minutes apart, crossing several days.
enum TranscriptStyleFixture {
    static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    static let start = Date(timeIntervalSince1970: 1_800_000_000)
    static let person = MessageAuthorPresentation(id: "user-zach", name: "Zach", avatarURL: nil)
    static let captain = MessageAuthorPresentation(
        id: "agent-blippy",
        name: "Blippy",
        avatarURL: nil,
        presence: .idle,
        kind: .captain
    )

    static func message(
        _ id: String,
        by author: MessageAuthorPresentation,
        at offset: TimeInterval,
        isPending: Bool = false,
        replyingTo parent: MessagePresentation? = nil
    ) -> MessagePresentation {
        MessagePresentation(
            id: id,
            author: author,
            content: "Message \(id)",
            createdAt: start.addingTimeInterval(offset),
            inlineReply: parent.map {
                MessageReplyReferencePresentation(
                    id: $0.id,
                    author: $0.author,
                    content: $0.content,
                    createdAt: $0.createdAt
                )
            },
            isPending: isPending
        )
    }

    /// `turns` turns, oldest first. Every third turn has a second reply.
    static func history(turns: Int) -> [MessagePresentation] {
        (0..<turns).flatMap { turn in
            let base = TimeInterval(turn) * 20 * 60
            var rows = [
                message("t\(turn)-ask", by: person, at: base),
                message("t\(turn)-reply", by: captain, at: base + 30),
            ]
            if turn % 3 == 0 {
                rows.append(message("t\(turn)-more", by: captain, at: base + 60))
            }
            return rows
        }
    }

    /// The ids of the rows whose entry differs between two projections —
    /// the rows a mounted table re-hosts.
    static func changedIDs(
        from old: [MessageTimelineEntry],
        to new: [MessageTimelineEntry]
    ) -> [String] {
        let previous = Dictionary(old.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return new.compactMap { entry in
            guard let before = previous[entry.id], before != entry else { return nil }
            return entry.id
        }
    }
}
