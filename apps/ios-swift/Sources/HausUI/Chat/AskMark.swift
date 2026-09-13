import HausModels
import SwiftUI

/// One Ask as it reads on its Message: the decision it waits on, and whose turn
/// it is.
///
/// The options ride along because the Ask's answer card offers them under the
/// question inside the Thread, and the Message is the one record both that card
/// and the Chat timeline's marker hold.
public struct AskPresentation: Hashable, Sendable {
    public enum Status: Hashable, Sendable {
        case open
        case answered
    }

    /// The word an Ask marker leads with, shared with the App's `askMarkerLabel`.
    public static let markerLabel = "Ask"
    /// What an open Ask is waiting for, shared by the marker and the answer card.
    public static let awaitingAnswer = "Awaiting answer"

    public let status: Status
    /// The human whose decision the Ask waits on. Absent once that member is no
    /// longer resolvable, which is a missing face rather than a missing Ask.
    public let addressee: MessageAuthorPresentation?
    /// The ways forward the Agent offered, in the order it wrote them — the
    /// first its recommendation. Empty is an open question, whose answer is
    /// whatever the human writes.
    public let options: [String]

    public init(
        status: Status,
        addressee: MessageAuthorPresentation? = nil,
        options: [String] = []
    ) {
        self.status = status
        self.addressee = addressee
        self.options = options
    }

    /// What the answer card leads with: the decision, and whose it is. The
    /// question itself is the Message above the card and is never repeated.
    public static func answerCardTitle(addressee: MessageAuthorPresentation?) -> String {
        guard let addressee else { return markerLabel }
        return "\(markerLabel) for \(addressee.name)"
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
            options: ask.options
        )
    }
}

/// The Ask marker as a Chat transcript row draws it: the Ask glyph, the word
/// `Ask`, the addressee whose decision it waits on, the accent ring, and
/// `· Awaiting answer`.
///
/// Task-chip grammar — annotation scale, muted throughout, with only the ring
/// carrying lifecycle color. An answered Ask draws nothing: the question and
/// its reply are ordinary conversation once somebody has taken the decision,
/// and a settled marker is bookkeeping nobody scanning back needs.
///
/// The marker is also the way in. An Ask with no replies yet shows no Thread
/// ingress, so without this the only surface that could open it was the Inbox;
/// `onOpen` gives the marker the ingress card's own press feedback and route.
/// Inside a Thread the Ask reads as `AskAnswerCard` instead, which is where it
/// is answered.
struct AskMark: View {
    let ask: AskPresentation
    let onOpen: () -> Void

    var body: some View {
        if ask.status == .open {
            Button(action: onOpen) {
                mark.contentShape(Rectangle())
            }
            .buttonStyle(.pressableRow(cornerRadius: 8))
            .accessibilityLabel("Open thread, \(AskPresentation.markerLabel)")
            .padding(.top, 4)
        }
    }

    private var mark: some View {
        HStack(spacing: 5) {
            HausIcon(.ask, size: 13, weight: 2)
                .frame(width: 13, height: 13)

            Text(AskPresentation.markerLabel)
                .lineLimit(1)

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

            AskOpenRing()
                .padding(.leading, 1)

            Text("· \(AskPresentation.awaitingAnswer)")
                .lineLimit(1)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
    }
}

/// The Ask's one point of lifecycle color: an accent ring while the question is
/// open. There is no settled counterpart, because a settled Ask draws nothing.
private struct AskOpenRing: View {
    var size: CGFloat = 14

    var body: some View {
        Circle()
            .stroke(Color.accentColor, lineWidth: 1.5 * (size / 16))
            .frame(width: 12 * (size / 16), height: 12 * (size / 16))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

#Preview("Ask marks") {
    VStack(alignment: .leading, spacing: 14) {
        AskMark(
            ask: AskPresentation(
                status: .open,
                addressee: MessageAuthorPresentation(id: "u1", name: "Zach", avatarURL: nil),
                options: ["Rename it", "Keep #product", "Ask the channel"]
            ),
            onOpen: {}
        )
        AskMark(
            ask: AskPresentation(
                status: .answered,
                addressee: MessageAuthorPresentation(id: "u1", name: "Zach", avatarURL: nil)
            ),
            onOpen: {}
        )
    }
    .padding(40)
}
