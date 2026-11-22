import HausModels
import SwiftUI

/// A model connection's glyph: Claude's asterisk, ChatGPT's ring, and so on. The brand tint
/// marks a connection in a header or the composer chip; rows draw it in ink.
struct ModelProviderMark: View {
    let provider: ModelProvider
    var size: CGFloat = 15
    var isTinted = false

    var body: some View {
        Image(systemName: Self.symbol(for: provider))
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(isTinted ? Self.tint(for: provider).color : HausTone.ink.color)
            .accessibilityHidden(true)
    }

    static func symbol(for provider: ModelProvider) -> String {
        switch provider {
        case .claude: "asterisk"
        case .chatgpt: "circle.circle"
        case .xai: "xmark"
        case .gemini: "sparkle"
        case .openrouter: "arrow.triangle.branch"
        }
    }

    static func tint(for provider: ModelProvider) -> HausTone {
        switch provider {
        case .claude: HausTone(HausSwatch(0xD97757))
        case .chatgpt, .xai, .openrouter: .mutedInk
        case .gemini: .accentInk
        }
    }
}
