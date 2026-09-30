#if canImport(UIKit)
import UIKit

@MainActor
extension TranscriptMenuAction {
    var menuElement: UIMenuElement {
        switch self {
        case let .action(title, systemImage, handler):
            UIAction(title: title, image: UIImage(systemName: systemImage)) { _ in handler() }
        case let .reactions(menu):
            menu.menuElement
        }
    }
}

@MainActor
extension TranscriptReactionMenu {
    /// The quick reactions sit on top as one row of small elements — the
    /// system's own compact row, like Mail's and Notes' — and who reacted
    /// follows as a submenu that expands in place, so the rest of the
    /// message menu keeps its length.
    var menuElement: UIMenuElement {
        let quick = Self.quickEmoji.map { emoji in
            let own = ownEmoji.contains(emoji)
            let action = UIAction(
                title: own ? "Remove \(emoji)" : "React with \(emoji)",
                image: EmojiMenuImage.image(emoji)
            ) { _ in onToggle(emoji, own) }
            action.state = own ? .on : .off
            return action
        }
        let row = UIMenu(title: "", options: .displayInline, children: quick)
        row.preferredElementSize = .small
        var children: [UIMenuElement] = [row]
        if !entries.isEmpty {
            children.append(reactorsMenu)
        }
        return UIMenu(title: "", options: .displayInline, children: children)
    }

    /// One line per sticker: the reactor's name beside the emoji they stuck.
    /// The viewer's own lines come first and carry the system checkmark, the
    /// menu's own mark for "this is yours, choosing it undoes it"; choosing
    /// one takes that reaction back. Anyone else's line is information only and
    /// leaves the menu open.
    private var reactorsMenu: UIMenu {
        let ordered = entries.filter(\.reactor.isViewer) + entries.filter { !$0.reactor.isViewer }
        let names = ordered.map(\.reactor.name).reduce(into: [String]()) { names, name in
            if !names.contains(name) { names.append(name) }
        }
        let lines = ordered.map { entry in
            let own = entry.reactor.isViewer
            let action = UIAction(title: entry.reactor.name, image: EmojiMenuImage.image(entry.emoji)) { _ in
                if own { onToggle(entry.emoji, true) }
            }
            if own {
                action.state = .on
                action.accessibilityHint = "Removes your reaction"
            } else {
                // Nothing to do with someone else's sticker; the menu stays.
                action.attributes = .keepsMenuPresented
            }
            return action
        }
        let count = entries.count
        return UIMenu(
            title: count == 1 ? "1 reaction" : "\(count) reactions",
            subtitle: names.joined(separator: ", "),
            image: UIImage(systemName: "face.smiling"),
            children: lines
        )
    }
}

/// An emoji drawn as a menu image, kept in its own colors.
enum EmojiMenuImage {
    @MainActor private static var cache: [String: UIImage] = [:]

    @MainActor
    static func image(_ emoji: String) -> UIImage {
        if let hit = cache[emoji] { return hit }
        let text = NSAttributedString(
            string: emoji,
            attributes: [.font: UIFont.systemFont(ofSize: 24)]
        )
        let image = UIGraphicsImageRenderer(size: text.size()).image { _ in
            text.draw(at: .zero)
        }.withRenderingMode(.alwaysOriginal)
        cache[emoji] = image
        return image
    }
}
#endif
