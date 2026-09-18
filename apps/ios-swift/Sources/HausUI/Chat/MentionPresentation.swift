import CoreGraphics
import Foundation

/// Every reference kind a message body can carry, mirroring the App's
/// `ReferenceKind`. The composer's picker offers Agents, humans, channels, and
/// Skills; the rest arrive as typed links an Agent or a human already wrote.
///
/// The App's `image` kind is deliberately absent: it exists only as a composer
/// attachment there and has no wire scheme, so nothing can persist one.
public enum MentionPresentationKind: CaseIterable, Hashable, Sendable {
    case agent
    case app
    case channel
    case directory
    case file
    case human
    case plugin
    case pullRequest
    case skill
    case website
}

/// What a reference draws in its capsule's leading edge.
///
/// One case per kind of mark, not one per kind of reference: an Agent and a
/// human wear the same avatar, an app and a plugin the same plug.
public enum RichReferenceMark: Hashable, Sendable {
    /// An identity's picture, falling back to its initials.
    case avatar(URL?)
    /// A channel's glyph in its own colored box.
    case channel(ChannelAppearance)
    /// A flat glyph in the label's own ink.
    case glyph(HausIconName)
    /// A brand's own glyph, in the brand's ink rather than the label's — the
    /// App's `brandColor`, which only its appearance overrides set.
    case brandGlyph(HausIconName, ReferenceBrandInk)

    /// The App draws the three-sparkle Skill mark at 16px where every other
    /// mark is 18px. The ratio, not the pixels, is what carries over: the
    /// phone's mark is a fraction of its line box and scales with Dynamic Type.
    public var sizeScale: CGFloat {
        self == .glyph(.skill) ? 16.0 / 18.0 : 1
    }
}

public struct MentionOptionPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let insertText: String
    public let label: String
    public let detail: String?
    public let kind: MentionPresentationKind
    public let avatarURL: URL?
    /// A channel option's live appearance. Nil for every other kind.
    public let channelAppearance: ChannelAppearance?

    public init(
        id: String,
        insertText: String,
        label: String,
        detail: String?,
        kind: MentionPresentationKind,
        avatarURL: URL?,
        channelAppearance: ChannelAppearance? = nil
    ) {
        self.id = id
        self.insertText = insertText
        self.label = label
        self.detail = detail
        self.kind = kind
        self.avatarURL = avatarURL
        self.channelAppearance = channelAppearance
    }
}

/// The autocomplete the composer is currently offering. `@` addresses Agents
/// and humans, `#` addresses channels, and `$` addresses Skills. Every trigger
/// reads the same way: the last one that opens a word, and everything typed
/// after it.
public struct ComposerMentionQuery: Equatable, Sendable {
    public let trigger: Character
    public let range: Range<String.Index>
    public let value: String

    public static func active(in text: String) -> ComposerMentionQuery? {
        var index = text.endIndex
        while index > text.startIndex {
            index = text.index(before: index)
            let trigger = text[index]
            guard trigger == "@" || trigger == "#" || trigger == "$" else { continue }
            // A sigil inside a word — `issue#3` — is text, not a query.
            guard index == text.startIndex || text[text.index(before: index)].isWhitespace else {
                continue
            }
            let value = String(text[text.index(after: index)...])
            guard !value.contains(where: \.isNewline), value.count <= 80 else { return nil }
            return ComposerMentionQuery(trigger: trigger, range: index..<text.endIndex, value: value)
        }
        return nil
    }

    public func inserting(_ option: MentionOptionPresentation, into text: String) -> String {
        text.replacingCharacters(
            in: range,
            with: "[\(sigiled(option))](\(option.id)) "
        )
    }

    /// The label the draft carries. An Agent, human, or channel option arrives
    /// with its sigil already on the Server's `insertText`; a Skill's arrives
    /// bare, so the `$` is added here, the way the App's `formatMentionLabel`
    /// adds it when it compiles a submission.
    private func sigiled(_ option: MentionOptionPresentation) -> String {
        guard option.kind == .skill, !option.insertText.hasPrefix("$") else {
            return option.insertText
        }
        return "$" + option.insertText
    }
}

public enum RichMessageSegment: Hashable, Sendable {
    /// Words, and the marks the author wrote around them. An unstyled run is
    /// the common case, so the marks default to none and `.text("hello")`
    /// still reads as plain prose.
    case text(String, style: RichInlineStyle = [])
    case reference(RichReferencePresentation)
    /// A Markdown link this client does not chip — a `haus://` resource, a
    /// `mailto:` address, a target naming no scheme at all. The App renders
    /// every one of them as an ordinary anchor, so the phone shows the words
    /// the link was written with rather than its Markdown.
    case link(text: String, target: String)
}

public struct RichReferencePresentation: Hashable, Sendable {
    public let id: String
    public let kind: MentionPresentationKind
    public let label: String
    public let avatarURL: URL?
    /// A channel reference's live appearance. Nil for every other kind, and
    /// nil for a channel the app cannot currently resolve.
    public let channelAppearance: ChannelAppearance?

    public init(
        id: String,
        kind: MentionPresentationKind,
        label: String,
        avatarURL: URL?,
        channelAppearance: ChannelAppearance? = nil
    ) {
        self.id = id
        self.kind = kind
        self.label = label
        self.avatarURL = avatarURL
        self.channelAppearance = channelAppearance
    }

    /// The address this reference opens when it is activated. A web link and a
    /// pull request are the two kinds whose target is a real address; every
    /// other kind names a Haus record, and the phone has no route to one yet.
    public var activationURL: URL? {
        switch kind {
        case .pullRequest, .website: RichReferenceWireForm.activationURL(for: id)
        default: nil
        }
    }

    /// The mark this reference draws. Derived rather than stored: an identity
    /// carries a URL and a channel an appearance, and every other kind is
    /// named by its kind alone.
    public var mark: RichReferenceMark {
        switch kind {
        case .agent, .human: .avatar(avatarURL)
        case .channel: .channel(channelAppearance ?? .default)
        case .app, .plugin: overrideMark ?? .glyph(.capability)
        case .directory: .glyph(.folder)
        case .file: .glyph(.document)
        case .pullRequest: .glyph(.pullRequest)
        case .skill: overrideMark ?? .glyph(.skill)
        case .website: .glyph(.website)
        }
    }

    /// The brand mark the App's appearance overrides name for a handful of
    /// Skills and capabilities — the GitHub Skills, every Chrome key — and
    /// nothing for anything else, which keeps its kind's own glyph.
    private var overrideMark: RichReferenceMark? {
        guard let appearance = ReferenceLabel.appearance(label, kind: kind, id: id),
              let glyph = appearance.glyph
        else { return nil }
        guard let brand = appearance.brand else { return .glyph(glyph) }
        return .brandGlyph(glyph, brand)
    }
}
