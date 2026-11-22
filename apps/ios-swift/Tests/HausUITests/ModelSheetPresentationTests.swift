import Foundation
import HausModels
@testable import HausUI
import Testing

struct ModelSheetPresentationTests {
    @Test func chipShowsTheCurrentModelName() {
        let presentation = ModelSheetFixtures.presentation()

        #expect(presentation.chipTitle == "Opus 5.5")
        #expect(presentation.chipProvider == .claude)
    }

    @Test func chipFallsBackToTheModelIDWhenNoConnectionListsIt() {
        let presentation = ModelSheetPresentation(
            captainName: "Blippy",
            current: AgentRuntimeConfiguration(modelID: "claude-old", reasoningEffort: .high, runtimeID: "claude-code"),
            groups: [ModelSheetFixtures.claude],
            access: .configurable
        )

        #expect(presentation.chipTitle == "claude-old")
        #expect(presentation.chipProvider == nil)
    }

    @Test func chipReadsModelWithNoCurrentConfiguration() {
        let presentation = ModelSheetPresentation(
            captainName: "Blippy",
            current: nil,
            groups: [ModelSheetFixtures.claude],
            access: .configurable
        )

        #expect(presentation.chipTitle == "Model")
    }

    @Test func onlyConfigurableAccessWrites() {
        #expect(ModelSheetFixtures.presentation(access: .configurable).isConfigurable)
        #expect(!ModelSheetFixtures.presentation(access: .viewerCannotConfigure).isConfigurable)
        #expect(!ModelSheetFixtures.presentation(access: .configureRefused(nil)).isConfigurable)
    }

    @Test func readOnlyFooterExplainsWhy() {
        let member = ModelSheetFixtures.presentation(access: .viewerCannotConfigure)
        let refused = ModelSheetFixtures.presentation(access: .configureRefused(nil))
        let refusedWithReason = ModelSheetFixtures.presentation(access: .configureRefused("Blippy’s Device is offline."))

        #expect(member.footer == "Only Owners and Admins can change Blippy’s model.")
        #expect(refused.footer == "Haus couldn’t change Blippy’s model.")
        #expect(refusedWithReason.footer == "Blippy’s Device is offline.")
    }

    @Test func currentRowShowsItsEffort() {
        let presentation = ModelSheetFixtures.presentation()
        let opus = ModelSheetFixtures.claude.options[0]
        let fable = ModelSheetFixtures.claude.options[1]

        #expect(presentation.isCurrent(opus))
        #expect(presentation.effortLabel(for: opus) == "High")
        #expect(!presentation.isCurrent(fable))
        #expect(presentation.effortLabel(for: fable) == nil)
    }

    @Test func pickingAnotherModelKeepsTheCurrentEffort() {
        let presentation = ModelSheetFixtures.presentation()
        let fable = ModelSheetFixtures.claude.options[1]

        #expect(
            presentation.configuration(selecting: fable)
                == AgentRuntimeConfiguration(modelID: "claude-fable-5-2", reasoningEffort: .high, runtimeID: "claude-code")
        )
    }

    @Test func pickingAModelWithoutTheCurrentEffortFallsBackToItsDefault() {
        let presentation = ModelSheetFixtures.presentation()
        let gpt = ModelSheetOption(
            runtimeID: "codex",
            model: SettingsRuntimeModel(
                id: "gpt-6.2-sol",
                label: "GPT-6.2 Sol",
                defaultReasoningEffort: .medium,
                reasoningEfforts: [.low, .medium]
            )
        )

        #expect(presentation.configuration(selecting: gpt).reasoningEffort == .medium)
        #expect(presentation.configuration(selecting: gpt).runtimeID == "codex")
    }

    @Test func pickingAnEffortWritesThatEffort() {
        let presentation = ModelSheetFixtures.presentation()
        let opus = ModelSheetFixtures.claude.options[0]

        #expect(
            presentation.configuration(selecting: opus, effort: .max)
                == AgentRuntimeConfiguration(modelID: "claude-opus-5-5", reasoningEffort: .max, runtimeID: "claude-code")
        )
    }

    @Test func effortPickerChecksOnlyTheCurrentModel() {
        let presentation = ModelSheetFixtures.presentation()

        #expect(ModelEffortPicker.selectedEffort(in: presentation, for: ModelSheetFixtures.claude.options[0]) == .high)
        #expect(ModelEffortPicker.selectedEffort(in: presentation, for: ModelSheetFixtures.claude.options[1]) == nil)
        #expect(ModelEffortPicker.efforts(for: ModelSheetFixtures.claude.options[0]) == [.low, .medium, .high, .xhigh, .max])
    }

    @Test func modelWithoutEffortChoiceOffersNoDrillIn() {
        let fixed = ModelSheetOption(
            runtimeID: "grok-build",
            model: SettingsRuntimeModel(id: "grok", label: "Grok", reasoningEfforts: [.default])
        )

        #expect(!fixed.offersEffortChoice)
        #expect(ModelSheetFixtures.claude.options[0].offersEffortChoice)
    }

    @Test func searchMatchesModelsAndConnections() {
        let presentation = ModelSheetFixtures.presentation()

        #expect(presentation.groups(matching: "").count == 2)
        #expect(presentation.groups(matching: "sonnet").map(\.id) == ["claude-max"])
        #expect(presentation.groups(matching: "sonnet").first?.options.map(\.model.label) == ["Sonnet 5.5"])
        #expect(presentation.groups(matching: "chatgpt").first?.options.count == 1)
        #expect(presentation.groups(matching: "llama").isEmpty)
    }

    @Test func groupTitleNamesProviderAndConnection() {
        #expect(ModelSheetFixtures.claude.title == "Claude · Zach’s Max")
        #expect(ModelSheetFixtures.openAI.title == "ChatGPT · API key")
    }
}
