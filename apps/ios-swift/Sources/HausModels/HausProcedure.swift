import Foundation

public enum HausProcedureKind: Sendable, Equatable {
    case query
    case mutation
}

public struct HausProcedure<Input: Encodable & Sendable, Output: Decodable & Sendable>: Sendable {
    public let path: String
    public let kind: HausProcedureKind

    public static func query(_ path: String) -> Self {
        Self(path: path, kind: .query)
    }

    public static func mutation(_ path: String) -> Self {
        Self(path: path, kind: .mutation)
    }
}
