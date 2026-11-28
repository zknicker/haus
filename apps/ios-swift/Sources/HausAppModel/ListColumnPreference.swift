import Foundation
import HausModels
import Observation

/// The list column each Server last showed, kept on this device per signed-in
/// user beside that Server's launch snapshot. It is presentation state and
/// never reaches Server. A Server with nothing kept shows the full list.
@MainActor
@Observable
public final class ListColumnPreference {
    public static let keyPrefix = "haus.listColumn."

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let key: String
    public private(set) var columns: [String: ListColumn]

    public init(userID: String, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        key = Self.keyPrefix + userID
        columns = Self.decode(defaults.object(forKey: key))
    }

    public func column(serverID: String?) -> ListColumn {
        serverID.flatMap { columns[$0] } ?? .full
    }

    public func save(_ column: ListColumn, serverID: String) {
        guard columns[serverID] != column else { return }
        columns[serverID] = column
        defaults.set(Self.encode(columns), forKey: key)
    }

    /// Membership loss: that Server's column goes, the others stay.
    public func clear(serverID: String) {
        guard columns.removeValue(forKey: serverID) != nil else { return }
        defaults.set(Self.encode(columns), forKey: key)
    }

    public func clearAll() {
        columns = [:]
        defaults.removeObject(forKey: key)
    }

    /// The property list the defaults hold: Server id to the column's name.
    public nonisolated static func encode(_ columns: [String: ListColumn]) -> [String: String] {
        columns.mapValues(\.rawValue)
    }

    /// A stored column this build doesn't know is dropped, so that Server
    /// shows the full list.
    public nonisolated static func decode(_ stored: Any?) -> [String: ListColumn] {
        guard let names = stored as? [String: String] else { return [:] }
        return names.compactMapValues(ListColumn.init(rawValue:))
    }
}
