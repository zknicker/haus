import Foundation
import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("List column preference")
struct ListColumnPreferenceTests {
    private let defaults = AppModelFixtures.defaults()

    @Test("A Server with nothing kept shows the full list")
    func defaultIsFull() {
        let preference = ListColumnPreference(userID: "user_1", defaults: defaults)

        #expect(preference.column(serverID: "srv_a") == .full)
        #expect(preference.column(serverID: nil) == .full)
    }

    @Test("Each Server keeps its own column across a relaunch")
    func perServerAcrossRelaunch() {
        let first = ListColumnPreference(userID: "user_1", defaults: defaults)
        first.save(.rail, serverID: "srv_a")
        first.save(.hidden, serverID: "srv_b")

        let relaunch = ListColumnPreference(userID: "user_1", defaults: defaults)

        #expect(relaunch.column(serverID: "srv_a") == .rail)
        #expect(relaunch.column(serverID: "srv_b") == .hidden)
        #expect(relaunch.column(serverID: "srv_c") == .full)
    }

    @Test("Another user's columns are not this user's")
    func perUser() {
        ListColumnPreference(userID: "user_1", defaults: defaults).save(.rail, serverID: "srv_a")

        #expect(ListColumnPreference(userID: "user_2", defaults: defaults).column(serverID: "srv_a") == .full)
    }

    @Test("Columns encode by name and decode back, dropping names this build doesn't know")
    func encodeDecode() {
        let columns: [String: ListColumn] = ["srv_a": .rail, "srv_b": .hidden, "srv_c": .full]

        #expect(ListColumnPreference.encode(columns) == ["srv_a": "rail", "srv_b": "hidden", "srv_c": "full"])
        #expect(ListColumnPreference.decode(ListColumnPreference.encode(columns)) == columns)
        #expect(ListColumnPreference.decode(["srv_a": "rail", "srv_b": "drawer"]) == ["srv_a": .rail])
        #expect(ListColumnPreference.decode("rail").isEmpty)
        #expect(ListColumnPreference.decode(nil).isEmpty)
    }

    @Test("Clearing one Server keeps the others, and clearing all forgets every one")
    func clearing() {
        let preference = ListColumnPreference(userID: "user_1", defaults: defaults)
        preference.save(.rail, serverID: "srv_a")
        preference.save(.hidden, serverID: "srv_b")

        preference.clear(serverID: "srv_a")

        #expect(ListColumnPreference(userID: "user_1", defaults: defaults).columns == ["srv_b": .hidden])

        preference.clearAll()

        #expect(ListColumnPreference(userID: "user_1", defaults: defaults).columns.isEmpty)
    }
}
