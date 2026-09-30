import Foundation

/// Someone who reacted, resolved against the Server directory. The viewer's
/// own entries carry `isViewer` and read "You".
public struct ReactorPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let avatarURL: URL?
    public let isViewer: Bool

    public init(id: String, name: String, avatarURL: URL? = nil, isViewer: Bool = false) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
        self.isViewer = isViewer
    }
}

/// One emoji on a message and everyone who stuck it, in the Server's order.
public struct MessageReactionPresentation: Hashable, Sendable {
    public let emoji: String
    public let reactors: [ReactorPresentation]

    public init(emoji: String, reactors: [ReactorPresentation]) {
        self.emoji = emoji
        self.reactors = reactors
    }
}

/// One die-cut sticker: a single reactor's single emoji.
struct ReactionSticker: Identifiable, Hashable, Sendable {
    let emoji: String
    let reactor: ReactorPresentation
    /// Whether the viewer reacted with this emoji, which makes a tap remove it.
    let isOwn: Bool

    var id: String { ReactionPile.key(emoji: emoji, reactorID: reactor.id) }
}

/// A message's reactions as a pile: one sticker per (emoji, reactor), the
/// first few drawn and the rest behind a "+N" chip. Mirrors the App's
/// `reaction-pile-model.ts`.
struct ReactionPile: Hashable, Sendable {
    /// Stickers drawn before the rest collapse into a "+N" chip.
    static let maxStickers = 4
    /// Horizontal step between resting stickers: neighbours overlap only
    /// slightly, so repeated copies of one emoji still read as separate
    /// silhouettes. The App's `restStep`.
    static let restStep: CGFloat = 19

    let stickers: [ReactionSticker]
    let overflow: [ReactionSticker]

    var all: [ReactionSticker] { stickers + overflow }
    var isEmpty: Bool { stickers.isEmpty }

    static func key(emoji: String, reactorID: String) -> String {
        "\(emoji)\u{0}\(reactorID)"
    }

    /// The Server's order — emoji by first arrival, then each emoji's
    /// reactors by arrival — with the viewer's unconfirmed adds at the end.
    static func build(
        reactions: [MessageReactionPresentation],
        pending: [String],
        viewerUserID: String?
    ) -> ReactionPile {
        var pairs: [(emoji: String, reactor: ReactorPresentation)] = []
        var seen: Set<String> = []
        func add(_ emoji: String, _ reactor: ReactorPresentation) {
            if seen.insert(key(emoji: emoji, reactorID: reactor.id)).inserted {
                pairs.append((emoji, reactor))
            }
        }
        for reaction in reactions {
            for reactor in reaction.reactors { add(reaction.emoji, reactor) }
        }
        if let viewerUserID {
            let you = ReactorPresentation(id: viewerUserID, name: "You", isViewer: true)
            for emoji in pending { add(emoji, you) }
        }

        let ownEmoji = Set(pairs.filter { $0.reactor.isViewer || $0.reactor.id == viewerUserID }.map(\.emoji))
        let all = pairs.map {
            ReactionSticker(emoji: $0.emoji, reactor: $0.reactor, isOwn: ownEmoji.contains($0.emoji))
        }
        return ReactionPile(
            stickers: Array(all.prefix(maxStickers)),
            overflow: Array(all.dropFirst(maxStickers))
        )
    }
}

/// A sticker's lean and its landing burst's seed, value for value the App's
/// `stickerTilt` and `stickerSeed`.
enum StickerPose {
    /// How far every sticker leans, in degrees.
    static let lean: Double = 8

    /// Exactly ±8°, alternating by place in the pile so neighbours' edges part
    /// instead of stacking into one shape. Every sticker shares one baseline.
    static func tilt(index: Int) -> Double {
        index.isMultiple(of: 2) ? -lean : lean
    }

    /// The stable seed for one sticker's landing burst.
    static func seed(messageID: String, sticker: ReactionSticker) -> UInt32 {
        stableHash("\(messageID):\(sticker.emoji):\(sticker.reactor.id)")
    }

    /// 32-bit FNV-1a over UTF-16 code units — the App's `stableHash`, so a
    /// sticker's burst scatters the same way on the phone as on the desktop.
    static func stableHash(_ text: String) -> UInt32 {
        var hash: UInt32 = 0x811C_9DC5
        for unit in text.utf16 {
            hash ^= UInt32(unit)
            hash = hash &* 0x0100_0193
        }
        return hash
    }
}
