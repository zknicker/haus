import HausModels
import SwiftUI

/// One Ask as it reads on its Message: the decision it waits on, whose turn it
/// is, and where that decision has got to.
///
/// The options ride along because the Ask's answer Thread offers them above its
/// composer, and the anchor Message is the one record that surface holds.
public struct AskPresentation: Hashable, Sendable {
    public enum Status: Hashable, Sendable {
        case open
        case answered
    }

    /// The word an Ask marker leads with, shared with the App's `askMarkerLabel`.
    public static let markerLabel = "Ask"

    public let status: Status
    /// The human whose decision the Ask waits on. Absent once that member is no
    /// longer resolvable, which is a missing face rather than a missing Ask.
    public let addressee: MessageAuthorPresentation?
    public let answeredByName: String?
    /// The ways forward the Agent offered, in the order it wrote them — the
    /// first its recommendation. Empty is an open question, whose answer is
    /// whatever the human writes.
    public let options: [String]

    public init(
        status: Status,
        addressee: MessageAuthorPresentation? = nil,
        answeredByName: String? = nil,
        options: [String] = []
    ) {
        self.status = status
        self.addressee = addressee
        self.answeredByName = answeredByName
        self.options = options
    }

    /// The trailing status one Ask reads as. An open Ask states only that it is
    /// open — the addressee beside it already says whose turn it is. A settled
    /// Ask names who answered, because the first answer wins permanently and
    /// that author is the fact a reader scanning back needs.
    public var statusText: String {
        switch status {
        case .open: "Open"
        case .answered: "Answered by \(answeredByName ?? "Unknown")"
        }
    }

    /// The marker a Message body earns, and nil for every body that is not an
    /// Ask. Names and faces resolve through the caller's one actor resolver, so
    /// an addressee who has since left the Server reads here as it does
    /// anywhere else.
    public static func present(
        _ body: ChatMessageBody,
        actor: (_ agentID: String?, _ userID: String?) -> MessageAuthorPresentation?
    ) -> AskPresentation? {
        guard case .ask(let ask) = body else { return nil }
        return AskPresentation(
            status: ask.status == .open ? .open : .answered,
            addressee: actor(nil, ask.addresseeUserID),
            answeredByName: ask.answeredBy.flatMap { answered in
                switch answered.kind {
                case .agent: actor(answered.id, nil)?.name
                case .user: actor(nil, answered.id)?.name
                }
            },
            options: ask.options
        )
    }
}

/// The Ask marker as a transcript row draws it: the Ask glyph, the addressee
/// whose decision it waits on, and a trailing status.
///
/// Task-chip grammar — annotation scale, muted throughout, with only the status
/// disc carrying lifecycle color. An open Ask says "Open" with the disc alone,
/// because the row it sits under is already the question.
///
/// In a Chat transcript the marker is also the way in. An Ask with no replies
/// yet shows no Thread ingress, so without this the only surface that could
/// open it was the Inbox; `onOpen` gives the marker the ingress card's own
/// press feedback and route. Inside a Thread the marker is already home, so it
/// is passed no handler and stays inert.
struct AskMark: View {
    let ask: AskPresentation
    var onOpen: (() -> Void)?

    var body: some View {
        if let onOpen {
            Button(action: onOpen) {
                mark.contentShape(Rectangle())
            }
            .buttonStyle(.pressableRow(cornerRadius: 8))
            .accessibilityLabel(accessibilityLabel)
            .accessibilityHint("Opens the Ask's thread")
        } else {
            mark
        }
    }

    private var mark: some View {
        HStack(spacing: 5) {
            HausIcon(.ask, size: 13, weight: 2)
                .frame(width: 13, height: 13)

            Text(AskPresentation.markerLabel)

            if let addressee = ask.addressee {
                AvatarView(
                    name: addressee.name,
                    url: addressee.avatarURL,
                    presence: addressee.presence,
                    size: 14
                )
                .padding(.leading, 1)
                Text(addressee.name)
                    .lineLimit(1)
            }

            AskStatusDisc(status: ask.status)
                .padding(.leading, 1)

            if ask.status == .answered {
                Text(ask.statusText)
                    .lineLimit(1)
            }
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        let addressee = ask.addressee.map { " for \($0.name)" } ?? ""
        return "\(AskPresentation.markerLabel)\(addressee). \(ask.statusText)"
    }
}

/// The Ask's one point of lifecycle color: an accent ring while the question is
/// open, a filled success disc with a check once somebody answered.
///
/// The check is cut out in the surface color rather than white, for the same
/// reason the task status disc is: the disc fills with a saturated hue, and a
/// white glyph washes out against it.
private struct AskStatusDisc: View {
    let status: AskPresentation.Status
    var size: CGFloat = 14

    var body: some View {
        ZStack {
            switch status {
            case .open:
                Circle()
                    .stroke(Color.accentColor, lineWidth: 1.5 * unit)
                    .frame(width: 12 * unit, height: 12 * unit)
            case .answered:
                Circle()
                    .fill(Color.green)
                    .frame(width: 13.5 * unit, height: 13.5 * unit)
                AskAnsweredCheck()
                    .stroke(
                        HausPlatformColor.background,
                        style: StrokeStyle(lineWidth: 1.5 * unit, lineCap: .round, lineJoin: .round)
                    )
                    .frame(width: size, height: size)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var unit: CGFloat { size / 16 }
}

/// The check the App draws inside an answered Ask, on its own 16pt grid.
private struct AskAnsweredCheck: Shape {
    func path(in rect: CGRect) -> Path {
        let unit = rect.width / 16
        var path = Path()
        path.move(to: CGPoint(x: 5.1 * unit, y: 8.3 * unit))
        path.addLine(to: CGPoint(x: 7.1 * unit, y: 10.3 * unit))
        path.addLine(to: CGPoint(x: 10.9 * unit, y: 6.1 * unit))
        return path
    }
}

#Preview("Ask marks") {
    VStack(alignment: .leading, spacing: 14) {
        AskMark(
            ask: AskPresentation(
                status: .open,
                addressee: MessageAuthorPresentation(id: "u1", name: "Zach", avatarURL: nil),
                options: ["Rename it", "Keep #product", "Ask the channel"]
            )
        )
        AskMark(
            ask: AskPresentation(
                status: .answered,
                addressee: MessageAuthorPresentation(id: "u1", name: "Zach", avatarURL: nil),
                answeredByName: "Zach"
            )
        )
    }
    .padding(40)
}
