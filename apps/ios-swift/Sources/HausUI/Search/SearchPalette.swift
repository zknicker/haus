import Foundation

/// The palette's matching: every local list filters by name, prefix matches
/// first, and a scope chip narrows the palette to one list.
enum SearchPalette {
    /// Rows a section shows when every scope shares the screen.
    static let sectionLimit = 5
    /// Tasks the zero-query Recent section shows.
    static let recentLimit = 4

    /// The local sections a query shows, in screen order. Messages come from
    /// the Server and show after these.
    static func localScopes(_ scope: SearchScope?) -> [SearchScope] {
        guard let scope else { return [.captains, .projects, .tasks, .people] }
        return scope == .messages ? [] : [scope]
    }

    static func searchesMessages(_ scope: SearchScope?) -> Bool {
        scope == nil || scope == .messages
    }

    static func captains(_ captains: [SearchCaptain], query: String) -> [SearchCaptain] {
        ranked(captains, query: query) { [$0.name] }
    }

    /// Projects are the channels in the directory; DMs are not Projects.
    static func projects(_ chats: [ChatPresentation], query: String) -> [ChatPresentation] {
        let channels = chats.filter { if case .channel = $0.kind { true } else { false } }
        return ranked(channels, query: query) { [$0.title] }
    }

    static func people(_ people: [SearchPerson], query: String) -> [SearchPerson] {
        ranked(people, query: query) { [$0.name, $0.handle].compactMap { $0 } }
    }

    /// Without a query, the most recently updated first.
    static func tasks(_ tasks: [SearchTask], query: String) -> [SearchTask] {
        let term = trimmed(query)
        guard !term.isEmpty else { return recent(tasks) }
        return ranked(recent(tasks), query: term) { [$0.title, $0.shortID] }
    }

    static func recent(_ tasks: [SearchTask]) -> [SearchTask] {
        tasks.sorted { $0.updatedAt > $1.updatedAt }
    }

    /// The DM the viewer already has with this person, if any.
    static func directMessage(with person: SearchPerson, in chats: [ChatPresentation]) -> ChatPresentation? {
        chats.first { chat in
            if case .humanDirectMessage(let human) = chat.kind { human.id == person.id } else { false }
        }
    }

    /// Items whose text contains the query, prefix matches first, in their
    /// given order otherwise. An empty query keeps every item.
    static func ranked<Item>(_ items: [Item], query: String, text: (Item) -> [String]) -> [Item] {
        let term = trimmed(query)
        guard !term.isEmpty else { return items }
        let options: String.CompareOptions = [.caseInsensitive, .diacriticInsensitive]
        let matches = items.filter { item in text(item).contains { $0.range(of: term, options: options) != nil } }
        let prefixed = matches.filter { item in
            text(item).contains { $0.range(of: term, options: options.union(.anchored)) != nil }
        }
        let rest = matches.filter { item in
            !text(item).contains { $0.range(of: term, options: options.union(.anchored)) != nil }
        }
        return prefixed + rest
    }

    static func trimmed(_ query: String) -> String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
