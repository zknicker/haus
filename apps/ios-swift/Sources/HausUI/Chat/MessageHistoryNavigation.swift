import Foundation

/// A transcript's available history and the actions that move its loaded window.
public struct MessageHistoryNavigation {
    public let hasOlder: Bool
    public let hasNewer: Bool
    public let isLoading: Bool
    public let followsLatest: Bool
    public let loadOlder: () async -> Bool
    public let loadNewer: () async -> Bool
    public let loadLatest: () async -> String?
    public let loadAround: (String) async -> Bool

    public init(
        hasOlder: Bool = false,
        hasNewer: Bool = false,
        isLoading: Bool = false,
        followsLatest: Bool = true,
        loadOlder: @escaping () async -> Bool = { false },
        loadNewer: @escaping () async -> Bool = { false },
        loadLatest: @escaping () async -> String? = { nil },
        loadAround: @escaping (String) async -> Bool = { _ in false }
    ) {
        self.hasOlder = hasOlder
        self.hasNewer = hasNewer
        self.isLoading = isLoading
        self.followsLatest = followsLatest
        self.loadOlder = loadOlder
        self.loadNewer = loadNewer
        self.loadLatest = loadLatest
        self.loadAround = loadAround
    }
}
