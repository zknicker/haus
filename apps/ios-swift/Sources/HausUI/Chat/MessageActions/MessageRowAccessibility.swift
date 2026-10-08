import SwiftUI
#if os(iOS)
import UIKit
#endif

/// What VoiceOver offers on one transcript message: the long-press drawer's
/// actions as rotor actions, because a long press on a hosted table row is a
/// UIKit gesture VoiceOver cannot reach. React opens the drawer itself, which
/// is where reactions live.
struct MessageRowAccessibilityActions {
    var onReact: (() -> Void)?
    var actions: [MessageAction] = []
    var perform: (MessageAction) -> Void = { _ in }

    static var none: Self { Self() }

    /// The same rows the drawer shows, so the two cannot drift apart.
    static func forMessage(
        _ message: MessagePresentation,
        canReplyInline: Bool,
        canOpenThread: Bool,
        onReact: @escaping () -> Void,
        onReply: @escaping () -> Void,
        onOpenThread: @escaping () -> Void
    ) -> Self {
        guard !message.isPending else { return .none }
        return MessageRowAccessibilityActions(
            onReact: onReact,
            actions: MessageActionMenu.groups(
                for: message,
                canReplyInline: canReplyInline,
                canOpenThread: canOpenThread
            ).flatMap(\.self),
            perform: { action in
                switch action {
                case .reply: onReply()
                case .replyInThread, .openThread: onOpenThread()
                case .copyText: MessageClipboard.copy(message)
                }
            }
        )
    }
}

enum MessageClipboard {
    static func copy(_ message: MessagePresentation) {
        #if os(iOS)
        UIPasteboard.general.string = message.prose
        #endif
    }
}

extension View {
    /// Reads a message's identity block as one element — author, time, then
    /// what it says — carrying the drawer's actions.
    func messageRowAccessibility(
        _ message: MessagePresentation,
        actions: MessageRowAccessibilityActions
    ) -> some View {
        accessibilityElement(children: .ignore)
            .accessibilityLabel(MessageRowAccessibilityLabel.label(for: message))
            .accessibilityActions {
                if let onReact = actions.onReact {
                    Button("React", action: onReact)
                }
                ForEach(actions.actions) { action in
                    Button(action.title) { actions.perform(action) }
                }
            }
    }
}

enum MessageRowAccessibilityLabel {
    static func label(for message: MessagePresentation, now: Date = .now) -> String {
        let day = TranscriptDayLabel.title(for: message.createdAt, now: now)
        let time = message.createdAt.formatted(date: .omitted, time: .shortened)
        let body = message.richBlocks
            .map { block -> String in
                if case .code(_, let text) = block { return text }
                return RichMessageAttributedText.accessibilityLabel(for: block.segments)
            }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
        let when = day == "Today" ? time : "\(day), \(time)"
        return [message.author.name, when, body, message.isPending ? "Sending" : nil]
            .compactMap { $0?.isEmpty == false ? $0 : nil }
            .joined(separator: ", ")
    }
}
