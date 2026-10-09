import Foundation
import HausModels
import Testing
@testable import HausUI

@Suite("Cloud Agent model")
struct CloudAgentModelChoiceTests {
    private let now = HausISO8601.date(from: "2026-10-02T12:00:00Z")!

    @Test("decodes a real-shaped catalog with families, order, effort, and fast")
    func decodesCatalog() throws {
        let catalog = try CloudAgentModelFixture.catalog()
        #expect(catalog.models.count == 8)
        let opus = try #require(catalog.models.first { $0.id == "claude-opus-5-5" })
        #expect(opus.family == .claude)
        #expect(opus.order == 3)
        #expect(opus.effort?.options.map(\.displayName) == ["Low", "Medium", "High", "Extra High", "Max"])
        #expect(opus.effort?.defaultValue == "medium")
        #expect(opus.fast == CloudAgentModelFast(defaultValue: false))
        let plain = try #require(catalog.models.first { $0.id == "claude-opus-4-5" })
        #expect(plain.effort == nil && plain.fast == nil)
        #expect(catalog.models.first { $0.id == "kimi-k3" }?.effort?.providerParamId == "reasoning")
    }

    @Test("decodes cloudAgentSettings.get and an unknown family as Other")
    func decodesSettings() throws {
        let settings = try HausJSON.decoder().decode(CloudAgentSettings.self, from: Data(
            #"{"model":{"kind":"model","id":"x","params":{"effort":"high"}},"catalog":{"models":[{"id":"x","displayName":"X","description":null,"family":"mistral","order":0,"effort":null,"fast":null}],"refreshedAt":"2026-10-02T10:00:00Z"},"savedModelUnavailable":false}"#.utf8
        ))
        #expect(settings.model == .model(id: "x", params: CloudAgentModelParams(effort: "high")))
        #expect(settings.catalog?.models.first?.family == .other)
    }

    @Test("encodes the setting union with required params, leaving out unset keys")
    func encodesSetting() throws {
        let encoder = HausJSON.encoder()
        encoder.outputFormatting = .sortedKeys
        let encode = { (setting: CloudAgentModelSetting) in String(decoding: try encoder.encode(setting), as: UTF8.self) }
        #expect(try encode(.auto) == #"{"kind":"auto"}"#)
        #expect(try encode(.model(id: "gpt-5", params: .modelDefaults)) == #"{"id":"gpt-5","kind":"model","params":{}}"#)
        #expect(try encode(.model(id: "gpt-5", params: CloudAgentModelParams(effort: "high", fast: false)))
            == #"{"id":"gpt-5","kind":"model","params":{"effort":"high","fast":false}}"#)
    }

    @Test("decodes a Run's model and tolerates a Run without one")
    func decodesRunModel() throws {
        let base = #""runId":"run-1","status":"completed","createdAt":"2026-10-02T10:00:00Z","branches":[],"startedAt":null,"terminalAt":null,"summary":null,"errorCode":null"#
        let run = try HausJSON.decoder().decode(CloudAgentRun.self, from: Data(
            #"{\#(base),"model":{"id":"claude-opus-5-5","params":[{"name":"effort","providerParamId":"effort","value":"high"}],"fallbackFrom":null,"droppedParams":["fast"]}}"#.utf8
        ))
        #expect(run.model == CloudAgentRunModel(
            id: "claude-opus-5-5",
            params: [.init(name: "effort", providerParamId: "effort", value: "high")],
            fallbackFrom: nil,
            droppedParams: ["fast"]
        ))
        let legacy = try HausJSON.decoder().decode(CloudAgentRun.self, from: Data("{\(base)}".utf8))
        #expect(legacy.model == nil)
    }

    @Test("Auto leads, then family sections in Cursor's order")
    func sections() throws {
        let choice = try choice(.auto)
        #expect(choice.sections().map(\.title) == [nil, "Claude", "GPT", "Gemini", "Grok", "Composer", "Other"])
        #expect(choice.sections()[1].options.map(\.name) == ["Claude Opus 5.5", "Claude Opus 4.5"])
        #expect(choice.sections().last?.options.map(\.name) == ["Kimi K3", "GLM 5.2"])
        #expect(choice.value == "Auto")
        #expect(choice.effort == nil && choice.fastIsOn == nil)
        #expect(choice.footer(canManage: true, now: now) == "Cursor picks a model for each run. Model list updated 2 hours ago.")
    }

    @Test("search matches names and ids and drops empty sections")
    func search() throws {
        let choice = try choice(.auto)
        #expect(choice.sections(matching: "opus").map(\.title) == ["Claude"])
        #expect(choice.sections(matching: "  OPUS ").first?.options.count == 2)
        #expect(choice.sections(matching: "gpt-5.6").first?.options.map(\.name) == ["GPT-5.6 Sol"])
        #expect(choice.sections(matching: "auto").map(\.title) == [nil])
        #expect(choice.sections(matching: "zzz").isEmpty)
    }

    @Test("picking a model resets params; re-picking the chosen one saves nothing")
    func modelReset() throws {
        let choice = try choice(.model(id: "claude-opus-5-5", params: CloudAgentModelParams(effort: "max", fast: true)))
        let options = choice.sections().flatMap(\.options)
        let opus = try #require(options.first { $0.setting.modelID == "claude-opus-5-5" })
        let gpt = try #require(options.first { $0.setting.modelID == "gpt-5.6-sol" })
        #expect(choice.isSelected(opus))
        #expect(choice.setting(selecting: opus) == nil)
        #expect(choice.setting(selecting: gpt) == .model(id: "gpt-5.6-sol", params: .modelDefaults))
        #expect(choice.setting(selecting: options[0]) == .auto)
    }

    @Test("Effort and Fast start at the saved value or the model default")
    func controls() throws {
        let defaults = try choice(.model(id: "claude-opus-5-5", params: .modelDefaults))
        #expect(defaults.value == "Claude Opus 5.5")
        #expect(defaults.effort?.selection == "medium")
        #expect(defaults.effort?.options.map(\.name) == ["Low", "Medium", "High", "Extra High", "Max"])
        #expect(defaults.fastIsOn == false)
        let saved = try choice(.model(id: "claude-opus-5-5", params: CloudAgentModelParams(effort: "max", fast: true)))
        #expect(saved.effort?.selection == "max")
        #expect(saved.fastIsOn == true)
        let plain = try choice(.model(id: "claude-opus-4-5", params: .modelDefaults))
        #expect(plain.effort == nil && plain.fastIsOn == nil)
        #expect(try choice(.model(id: "composer-2.5", params: .modelDefaults)).effort == nil)
    }

    @Test("an edit keeps the other param and leaves the model default unset")
    func controlEdits() throws {
        let choice = try choice(.model(id: "claude-opus-5-5", params: CloudAgentModelParams(fast: true)))
        #expect(choice.setting(effort: "high") == .model(id: "claude-opus-5-5", params: CloudAgentModelParams(effort: "high", fast: true)))
        #expect(choice.setting(effort: "medium") == .model(id: "claude-opus-5-5", params: CloudAgentModelParams(fast: true)))
        #expect(choice.setting(fast: false) == .model(id: "claude-opus-5-5", params: .modelDefaults))
        #expect(try self.choice(.auto).setting(fast: true) == nil)
    }

    @Test("a saved param the model no longer offers reads as the default and is never resent")
    func droppedParams() throws {
        let choice = try choice(.model(id: "claude-opus-5-5", params: CloudAgentModelParams(effort: "ultra")))
        #expect(choice.effort?.selection == "medium")
        #expect(choice.droppedParamNames == ["effort"])
        #expect(choice.footer(canManage: true, now: now).contains("The saved effort setting isn't offered anymore"))
        #expect(choice.setting(fast: true) == .model(id: "claude-opus-5-5", params: CloudAgentModelParams(fast: true)))
    }

    @Test("a catalog dated now or ahead of this clock reads just now")
    func freshCatalog() {
        let catalog = CloudAgentModelCatalog(models: [], refreshedAt: now.addingTimeInterval(30))
        let choice = CloudAgentModelChoice(settings: CloudAgentSettings(model: .auto, catalog: catalog, savedModelUnavailable: false))
        #expect(choice.footer(canManage: true, now: now).hasSuffix("Model list updated just now."))
    }

    @Test("an effort without a named default offers Default, which leaves it unset")
    func effortWithoutDefault() throws {
        let model = CloudAgentModel(
            id: "m", displayName: "M", family: .other,
            effort: CloudAgentModelEffort(options: [.init(value: "low", displayName: "Low")], defaultValue: nil)
        )
        let catalog = CloudAgentModelCatalog(models: [model], refreshedAt: now)
        let choice = CloudAgentModelChoice(settings: CloudAgentSettings(model: .model(id: "m", params: .modelDefaults), catalog: catalog, savedModelUnavailable: false))
        #expect(choice.effort?.options.map(\.name) == ["Default", "Low"])
        #expect(choice.effort?.selection == nil)
        #expect(choice.setting(effort: "low") == .model(id: "m", params: CloudAgentModelParams(effort: "low")))
        #expect(choice.setting(effort: nil) == .model(id: "m", params: .modelDefaults))
    }

    @Test("members read the value; a dropped saved model reads Unavailable without controls")
    func memberAndUnavailable() throws {
        #expect(try choice(.model(id: "gpt-5.6-sol", params: .modelDefaults)).footer(canManage: false, now: now)
            .hasSuffix("Only an owner or admin can change the model."))
        let gone = try choice(.model(id: "gpt-4o", params: CloudAgentModelParams(effort: "high")), unavailable: true)
        #expect(gone.value == "Unavailable")
        #expect(gone.unavailableModelID == "gpt-4o")
        #expect(gone.effort == nil && gone.fastIsOn == nil && gone.droppedParamNames.isEmpty)
        // Tapping the unavailable row saves nothing; it would resend an unlisted id.
        let goneRow = CloudAgentModelChoice.Option(setting: .model(id: "gpt-4o", params: .modelDefaults), name: "gpt-4o", detail: nil)
        #expect(gone.setting(selecting: goneRow) == nil)
        #expect(gone.footer(canManage: true, now: now).hasPrefix("The saved model, gpt-4o, isn't available, so runs use Auto until an available model is picked."))
    }

    @Test("without a catalog only Auto exists; a saved model can still be cleared")
    func noCatalog() {
        let empty = CloudAgentModelChoice(settings: CloudAgentSettings(model: .auto, catalog: nil, savedModelUnavailable: false))
        #expect(empty.sections().flatMap(\.options).map(\.name) == ["Auto"])
        #expect(!empty.isEditable(canManage: true))
        #expect(empty.footer(canManage: true, now: now).contains("appears once a Computer connected to Cursor reports it"))
        let saved = CloudAgentModelChoice(settings: CloudAgentSettings(model: .model(id: "gpt-4o", params: .modelDefaults), catalog: nil, savedModelUnavailable: true))
        #expect(saved.isEditable(canManage: true))
        #expect(saved.value == "Unavailable")
    }

    private func choice(_ model: CloudAgentModelSetting, unavailable: Bool = false) throws -> CloudAgentModelChoice {
        CloudAgentModelChoice(settings: CloudAgentSettings(
            model: model, catalog: try CloudAgentModelFixture.catalog(), savedModelUnavailable: unavailable
        ))
    }
}
