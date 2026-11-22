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

    /// Captain authors carry their presence; people never do.
    init(_ message: MessagePresentation) {
        self = message.author.presence == nil ? .person : .captain
    }
}
