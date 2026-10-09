@testable import HausUI
import Testing

/// A fenced code block's header names its language the way the App does.
struct CodeFenceLanguageTests {
    /// The header labels the fence from its info string, so the parser keeps
    /// it — trimmed, extra words and all — for each fence in a body.
    @Test func capturesEachFencesInfoStringForItsHeader() {
        let source = "```python\nprint('hi')\n```\n\n```  bash  \nls\n```\n\n```ts title=a.ts\nx\n```"

        #expect(RichMessageBlockParser.blocks(source) { _, _, _ in nil } == [
            .code(language: "python", text: "print('hi')"),
            .code(language: "bash", text: "ls"),
            .code(language: "ts title=a.ts", text: "x"),
        ])
    }

    /// The App's `codeLanguageForFence` labels, by extension, name, or Shiki id.
    @Test func labelsAFenceTheWayTheAppDoes() {
        #expect(CodeFenceLanguage.label(forFence: "py") == "Python")
        #expect(CodeFenceLanguage.label(forFence: "python") == "Python")
        #expect(CodeFenceLanguage.label(forFence: "sh") == "Shell")
        #expect(CodeFenceLanguage.label(forFence: "bash") == "Shell")
        #expect(CodeFenceLanguage.label(forFence: "zsh") == "Shell")
        #expect(CodeFenceLanguage.label(forFence: "shellscript") == "Shell")
        #expect(CodeFenceLanguage.label(forFence: "ts") == "TypeScript")
        #expect(CodeFenceLanguage.label(forFence: "TSX") == "TSX")
        #expect(CodeFenceLanguage.label(forFence: "yml") == "YAML")
        #expect(CodeFenceLanguage.label(forFence: "txt") == "Text")
    }

    @Test func labelsAFenceWithNoLanguageAsText() {
        #expect(CodeFenceLanguage.label(forFence: nil) == "Text")
        #expect(CodeFenceLanguage.label(forFence: "") == "Text")
        #expect(CodeFenceLanguage.label(forFence: "   ") == "Text")
    }

    /// Only the first word names the language, as the App's `language-*`
    /// class does; an unknown one passes through and the header uppercases it.
    @Test func labelsByTheFirstWordAndPassesUnknownNamesThrough() {
        #expect(CodeFenceLanguage.label(forFence: "ts title=a.ts") == "TypeScript")
        #expect(CodeFenceLanguage.label(forFence: "Elixir") == "elixir")
    }
}
