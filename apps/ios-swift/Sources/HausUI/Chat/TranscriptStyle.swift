import Foundation

/// How a transcript lays out its rows, chosen by the place it shows
/// (`specs/ios-app.md`, "Places and transcripts").
public enum TranscriptStyle: Equatable, Sendable {
    /// Captain DMs and Task chats: the person's messages are right-aligned
    /// bubbles, Captain replies are full-width prose with a copy control, and
    /// turns are separated by centered times.
    case assistant
    /// Projects and `#all`: avatar, name, and time, then the message.
    case roster
}

/// Who a row speaks for in the assistant layout.
enum TranscriptSpeaker: Equatable, Sendable {
    /// A person, drawn as a bubble.
    case person
    /// A Captain, drawn as full-width prose.
    case captain

    /// The author's kind decides, so a Captain with no presence (deleted, or not yet listed)
    /// still speaks as a Captain.
    init(_ message: MessagePresentation) {
        self = message.author.kind == .captain ? .captain : .person
    }
}
