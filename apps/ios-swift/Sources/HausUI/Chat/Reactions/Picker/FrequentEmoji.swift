import Foundation

/// The viewer's most used reaction emoji, kept on this device.
///
/// Ordered by how often each was used, then how recently; the App's quick set
/// seeds the list so a first launch shows the same four as the App's hover
/// bar, and any real use outranks every seed. The drawer's quick tiles are its
/// head and the picker's "Frequently used" section its first rows.
struct FrequentEmoji {
    /// The App's hover-bar set, in its order, then two of Discord's staples.
    static let seed = ["👍", "❤️", "😂", "💯", "🔥", "👋"]
    /// Uses remembered; older, rarer ones fall off the end.
    static let capacity = 32

    private let defaults: UserDefaults
    private let key: String

    init(defaults: UserDefaults = .standard, key: String = "haus.reactions.frequentEmoji") {
        self.defaults = defaults
        self.key = key
    }

    /// Used emoji first, then the seeds not yet used.
    func ordered() -> [String] {
        let used = usage().sorted(by: Self.ranks).map(\.key)
        return used + Self.seed.filter { !used.contains($0) }
    }

    func record(_ emoji: String, at date: Date = .now) {
        var usage = usage()
        let count = (usage[emoji]?.count ?? 0) + 1
        usage[emoji] = Usage(count: count, lastUsed: date.timeIntervalSinceReferenceDate)
        // The weakest other entry makes room, so a new pick always sticks.
        if usage.count > Self.capacity,
           let weakest = usage.filter({ $0.key != emoji }).sorted(by: Self.ranks).last {
            usage.removeValue(forKey: weakest.key)
        }
        guard let data = try? JSONEncoder().encode(usage) else { return }
        defaults.set(data, forKey: key)
    }

    private func usage() -> [String: Usage] {
        guard let data = defaults.data(forKey: key),
              let usage = try? JSONDecoder().decode([String: Usage].self, from: data)
        else { return [:] }
        return usage
    }

    private static func ranks(_ lhs: (key: String, value: Usage), _ rhs: (key: String, value: Usage)) -> Bool {
        lhs.value.count != rhs.value.count
            ? lhs.value.count > rhs.value.count
            : lhs.value.lastUsed > rhs.value.lastUsed
    }

    private struct Usage: Codable {
        let count: Int
        let lastUsed: TimeInterval
    }
}
