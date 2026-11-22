import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Server selection")
struct ServerSelectionTests {
    private let a = AppModelFixtures.server("srv_a")
    private let b = AppModelFixtures.server("srv_b")

    @Test("The persisted Server wins over list order")
    func persistedWins() {
        #expect(ServerSelection.activeServerID(in: [a, b], preferred: "srv_b") == "srv_b")
    }

    @Test("A persisted Server the viewer left falls back to the first listed")
    func lostPreferenceFallsBack() {
        #expect(ServerSelection.activeServerID(in: [a, b], preferred: "srv_gone") == "srv_a")
        #expect(ServerSelection.activeServerID(in: [], preferred: "srv_a") == nil)
    }

    @Test("A list that no longer leads with the active Server is not a membership loss")
    func nonFirstIsKept() {
        let change = ServerSelection.change(activeServerID: "srv_b", current: [b], loaded: [a, b])
        #expect(change == .updated([a, b]))
    }

    @Test("Only a list without the active Server is a membership loss")
    func missingIsLost() {
        #expect(ServerSelection.change(activeServerID: "srv_b", current: [a, b], loaded: [a]) == .membershipLost)
        #expect(ServerSelection.change(activeServerID: "srv_a", current: [a, b], loaded: [a, b]) == .unchanged)
    }

    @Test("A return to the same Server still retires reads from before the switch")
    func generationRetiresOldTickets() throws {
        let scope = ServerScope()
        scope.activate("srv_a")
        let before = try scope.requireTicket()
        scope.activate("srv_b")
        scope.activate("srv_a")

        #expect(!scope.isCurrent(before))
        #expect(scope.isCurrent(try scope.requireTicket()))
    }

    @Test("Activating the active Server keeps its tickets current")
    func reactivationKeepsTickets() throws {
        let scope = ServerScope()
        scope.activate("srv_a")
        let ticket = try scope.requireTicket()
        scope.activate("srv_a")

        #expect(scope.isCurrent(ticket))
    }

    @Test("No active Server means no ticket")
    func noServerNoTicket() {
        #expect(throws: ServerScopeError.serverUnavailable) { try ServerScope().requireTicket() }
    }
}
