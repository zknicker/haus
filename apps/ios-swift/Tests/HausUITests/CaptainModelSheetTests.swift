import Foundation
import HausModels
@testable import HausUI
import Testing

/// The Captain DM model chip's sheet, built from model connections and the runners' catalog.
struct CaptainModelSheetTests {
    private func connections() throws -> [ModelConnection] {
        let json = """
        [
          {"authKind":"setup-token","capacity":null,"enabled":true,"id":"claude-work","isDefault":false,"label":"Work","position":0,"provider":"claude","status":"ready","statusDetail":null,"updatedAt":"2027-01-15T08:00:00.000Z","webSearch":false},
          {"authKind":"oauth","capacity":null,"enabled":true,"id":"claude-max","isDefault":true,"label":"Zach’s Max","position":1,"provider":"claude","status":"ready","statusDetail":null,"updatedAt":"2027-01-15T08:00:00.000Z","webSearch":false},
          {"authKind":"api-key","capacity":null,"enabled":true,"id":"openai","isDefault":false,"label":"API key","position":2,"provider":"chatgpt","status":"ready","statusDetail":null,"updatedAt":"2027-01-15T08:00:00.000Z","webSearch":false},
          {"authKind":"api-key","capacity":null,"enabled":false,"id":"xai","isDefault":false,"label":"Off","position":3,"provider":"xai","status":"ready","statusDetail":null,"updatedAt":"2027-01-15T08:00:00.000Z","webSearch":false}
        ]
        """
        return try HausJSON.decoder().decode([ModelConnection].self, from: Data(json.utf8))
    }

    private let runtimes = [
        ComputerRuntimeSummary(id: "claude-code", label: "Claude Code", models: [
            ComputerModelSummary(id: "claude-opus-5-5", label: "Opus 5.5"),
            ComputerModelSummary(id: "claude-sonnet-5-5", label: "Sonnet 5.5"),
        ]),
        ComputerRuntimeSummary(id: "codex", label: "Codex", models: [
            ComputerModelSummary(id: "gpt-6.2-sol", label: "GPT-6.2 Sol"),
            ComputerModelSummary(id: "grok-5", label: "Grok 5"),
        ]),
    ]

    @Test func eachProviderGroupsItsModelsUnderItsDefaultConnection() throws {
        let sheet = CaptainModelSheet.presentation(
            captainName: "Blippy",
            current: AgentRuntimeConfiguration(modelID: "claude-opus-5-5", reasoningEffort: .high, runtimeID: "claude-code"),
            connections: try connections(),
            runtimes: runtimes,
            canConfigure: true
        )

        #expect(sheet.groups.map(\.title) == ["Claude · Zach’s Max", "ChatGPT · API key"])
        #expect(sheet.groups[0].options.map(\.model.id) == ["claude-opus-5-5", "claude-sonnet-5-5"])
        #expect(sheet.chipTitle == "Opus 5.5")
        #expect(sheet.isConfigurable)
    }

    @Test func aMemberSeesTheModelReadOnly() throws {
        let sheet = CaptainModelSheet.presentation(
            captainName: "Blippy", current: nil, connections: try connections(), runtimes: runtimes, canConfigure: false
        )

        #expect(sheet.access == .viewerCannotConfigure)
    }

    @Test func aModelIdNamesItsProvider() {
        #expect(CaptainModelSheet.provider(forModelID: "anthropic/claude-x") == .openrouter)
        #expect(CaptainModelSheet.provider(forModelID: "claude-opus-5-5") == .claude)
        #expect(CaptainModelSheet.provider(forModelID: "grok-5") == .xai)
        #expect(CaptainModelSheet.provider(forModelID: "gemini-3") == .gemini)
        #expect(CaptainModelSheet.provider(forModelID: "gpt-6.2-sol") == .chatgpt)
    }
}
