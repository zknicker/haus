import HausModels
import SwiftUI

/// The Reminder or Trigger fire a message answers, as its context line says it.
public struct MessageCausePresentation: Hashable, Sendable {
    public enum Kind: Hashable, Sendable {
        case reminder
        case trigger
    }

    public let kind: Kind
    public let title: String

    public init(kind: Kind, title: String) {
        self.kind = kind
        self.title = title
    }

    /// Nil for a kind this build does not know: the line names the automation
    /// by its mark, and an unknown kind has none to stand in for an author.
    public init?(_ cause: ChatMessageCause) {
        let title = cause.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return nil }
        switch cause.kind {
        case .reminder: self.init(kind: .reminder, title: title)
        case .trigger: self.init(kind: .trigger, title: title)
        case .unknown: return nil
        }
    }

    var glyph: HausIconName { kind == .reminder ? .reminder : .trigger }

    public var accessibilityLabel: String {
        "\(kind == .reminder ? "Reminder" : "Trigger"): \(title)"
    }
}

/// Why an Agent spoke, on a context line above its message — the line an
/// inline reply's parent takes, so a fire reads as what the message answers
/// (the App's `MessageCauseLine`). The automation's glyph stands where a reply
/// shows its parent's avatar, in a soft box of the automation's own ink, and
/// the title fills the rest of the line. A fire writes nothing else to the
/// transcript, so this line is its only trace there.
///
/// The App's hover card and its link into the Agent's Automations have no
/// phone surface yet, so the line is a statement, not a control.
struct MessageCauseLine: View {
    let cause: MessageCausePresentation
    @Environment(\.colorScheme) private var colorScheme
    @ScaledMetric(relativeTo: .footnote) private var markSize: CGFloat = 18

    var body: some View {
        let ink = AutomationMarkInk.tint(cause.kind, colorScheme)
        HStack(spacing: 0) {
            InlineReplyElbow(color: ink.opacity(0.45))
                .frame(width: InlineReplyElbow.railWidth)
            HStack(spacing: 6) {
                HausIcon(cause.glyph, size: markSize * 0.66, weight: 1.8)
                    .foregroundStyle(ink)
                    .frame(width: markSize, height: markSize)
                    .background(ink.opacity(0.18), in: .rect(cornerRadius: markSize / 3, style: .continuous))
                Text(cause.title)
                    .fontWeight(.medium)
                    .foregroundStyle(ink)
            }
            .font(.footnote)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(cause.accessibilityLabel)
    }
}

/// The App's `--reminder-mark` and `--trigger-mark` product tokens, resolved
/// from their OKLCH values once per scheme: a rose for Reminders and an amber
/// for Triggers, darker on a light page so the title keeps its contrast.
enum AutomationMarkInk {
    static func tint(_ kind: MessageCausePresentation.Kind, _ scheme: ColorScheme) -> Color {
        switch (kind, scheme) {
        case (.reminder, .dark): Color(red: 1, green: 0.524, blue: 0.58)
        case (.reminder, _): Color(red: 0.819, green: 0.29, blue: 0.395)
        case (.trigger, .dark): Color(red: 0.967, green: 0.803, blue: 0.227)
        case (.trigger, _): Color(red: 0.722, green: 0.544, blue: 0)
        }
    }
}
