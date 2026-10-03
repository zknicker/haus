import Foundation
import HausModels
import Testing
@testable import HausUI

@Suite("Cloud Agent model")
struct CloudAgentModelChoiceTests {
    private let now = HausISO8601.date(from: "2026-10-02T12:00:00Z")!

    @Test("decodes cloudAgentSettings.get with a catalog and a saved model")
    func decodesSettings() throws {
        let settings = try decode(
            #"{"model":{"kind":"model","id":"gpt-5"},"catalog":{"models":[{"id":"gpt-5","displayName":"GPT-5","description":null},{"id":"sonnet","displayName":"Sonnet 4.5","description":"Fast"}],"refreshedAt":"2026-10-02T10:00:00Z"},"savedModelUnavailable":false}"#
        )
        #expect(settings.model == .model(id: "gpt-5"))
        #expect(settings.catalog?.models.map(\.displayName) == ["GPT-5", "Sonnet 4.5"])
        #expect(settings.catalog?.models.last?.description == "Fast")
    }

    @Test("encodes the setting union as the Server's discriminated shape")
    func encodesSetting() throws {
        let encoder = HausJSON.encoder()
        encoder.outputFormatting = .sortedKeys
        #expect(String(decoding: try encoder.encode(CloudAgentModelSetting.auto), as: UTF8.self) == #"{"kind":"auto"}"#)
        #expect(String(decoding: try encoder.encode(CloudAgentModelSetting.model(id: "gpt-5")), as: UTF8.self) == #"{"id":"gpt-5","kind":"model"}"#)
    }

    @Test("decodes a Run's model and tolerates a Run without one")
    func decodesRunModel() throws {
        let base = #""runId":"run-1","status":"completed","branches":[],"startedAt":null,"terminalAt":null,"summary":null,"errorCode":null"#
        let fellBack = try HausJSON.decoder().decode(
            CloudAgentRun.self,
            from: Data(#"{\#(base),"model":{"id":null,"fallbackFrom":"gpt-5"}}"#.utf8)
        )
        #expect(fellBack.model == CloudAgentRunModel(id: nil, fallbackFrom: "gpt-5"))
        let legacy = try HausJSON.decoder().decode(CloudAgentRun.self, from: Data("{\(base)}".utf8))
        #expect(legacy.model == nil)
    }

    @Test("Cursor default lists first, then Cursor's models")
    func autoState() {
        let choice = CloudAgentModelChoice(settings: settings(.auto))
        #expect(choice.options.map(\.name) == ["Cursor default", "GPT-5", "Sonnet 4.5"])
        #expect(choice.value == "Cursor default")
        #expect(choice.isEditable(canManage: true))
        #expect(!choice.isEditable(canManage: false))
        #expect(choice.footer(canManage: true, now: now) == "Uses your Cursor account's default model (Auto unless you've changed it). Model list updated 2 hours ago.")
    }

    @Test("a listed model shows its display name; members read it")
    func listedModel() {
        let choice = CloudAgentModelChoice(settings: settings(.model(id: "sonnet")))
        #expect(choice.value == "Sonnet 4.5")
        #expect(choice.unavailableModelID == nil)
        #expect(choice.footer(canManage: false, now: now).hasSuffix("Only an owner or admin can change the model."))
    }

    @Test("a saved model the catalog dropped reads Unavailable and falls back to Cursor default")
    func unavailableModel() {
        let choice = CloudAgentModelChoice(settings: settings(.model(id: "gpt-4o"), unavailable: true))
        #expect(choice.value == "Unavailable")
        #expect(choice.unavailableModelID == "gpt-4o")
        #expect(choice.footer(canManage: true, now: now).hasPrefix("The saved model, gpt-4o, isn't available, so runs use Cursor default until an available model is picked."))
    }

    @Test("without a catalog only Cursor default exists and the row is disabled")
    func noCatalog() {
        let choice = CloudAgentModelChoice(settings: CloudAgentSettings(model: .auto, catalog: nil, savedModelUnavailable: false))
        #expect(choice.options.map(\.name) == ["Cursor default"])
        #expect(choice.value == "Cursor default")
        #expect(!choice.isEditable(canManage: true))
        #expect(choice.footer(canManage: true, now: now).contains("appears once a Computer connected to Cursor reports it"))
    }

    @Test("without a catalog a saved model can still be cleared to Cursor default")
    func noCatalogSavedModel() {
        let choice = CloudAgentModelChoice(settings: CloudAgentSettings(model: .model(id: "gpt-4o"), catalog: nil, savedModelUnavailable: true))
        #expect(choice.isEditable(canManage: true))
        #expect(choice.value == "Unavailable")
    }

    private func settings(_ model: CloudAgentModelSetting, unavailable: Bool = false) -> CloudAgentSettings {
        CloudAgentSettings(
            model: model,
            catalog: CloudAgentModelCatalog(
                models: [
                    CloudAgentModel(id: "gpt-5", displayName: "GPT-5"),
                    CloudAgentModel(id: "sonnet", displayName: "Sonnet 4.5", description: "Fast"),
                ],
                refreshedAt: HausISO8601.date(from: "2026-10-02T10:00:00Z")!
            ),
            savedModelUnavailable: unavailable
        )
    }

    private func decode(_ json: String) throws -> CloudAgentSettings {
        try HausJSON.decoder().decode(CloudAgentSettings.self, from: Data(json.utf8))
    }
}
