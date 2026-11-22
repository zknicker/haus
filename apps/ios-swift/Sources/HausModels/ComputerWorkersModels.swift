import Foundation

/// `computer.setWorkers`: the **Workers can run here** switch.
public struct ComputerSetWorkersInput: Encodable, Equatable, Sendable {
    public let computerID: String
    public let enabled: Bool
    public let serverID: String

    public init(computerID: String, enabled: Bool, serverID: String) {
        self.computerID = computerID
        self.enabled = enabled
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case computerID = "computerId"
        case enabled
        case serverID = "serverId"
    }
}

public struct ComputerSetWorkersResult: Decodable, Equatable, Sendable {
    public let computerID: String

    enum CodingKeys: String, CodingKey {
        case computerID = "computerId"
    }
}

public enum ComputerWorkersProcedures {
    public static let setWorkers = HausProcedure<ComputerSetWorkersInput, ComputerSetWorkersResult>
        .mutation("computer.setWorkers")
}
