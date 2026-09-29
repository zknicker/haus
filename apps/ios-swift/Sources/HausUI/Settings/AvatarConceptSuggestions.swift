import SwiftUI

/// Starting concepts for an empty field.
///
/// A blank text box is the hardest part of this flow: the prompt does the
/// styling, so the human only has to name a character, and one tap on a real
/// example teaches that faster than the help text above it. It lives inside the
/// concept card and bleeds to that card's edges, so a chip run reads as part of
/// the field rather than as a second control.
struct AvatarConceptSuggestions: View {
    let onSelect: (String) -> Void

    /// The card's own inset, which the scroller re-adds inside its content so
    /// chips start on the text's rail and still scroll off the card edge.
    private static let cardInset: CGFloat = 16

    static let concepts = [
        "a moonlit fox cartographer",
        "a brass-goggled octopus engineer",
        "a sleepy cactus astronaut",
        "a neon koi librarian",
        "a mossy stone gardener",
    ]

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Self.concepts, id: \.self) { concept in
                    Button {
                        onSelect(concept)
                    } label: {
                        Text(concept)
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .padding(.horizontal, 13)
                            .padding(.vertical, 8)
                            .background(HausPlatformColor.inputSurface, in: .capsule)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Fills the concept field")
                }
            }
            .padding(.horizontal, Self.cardInset)
        }
        .scrollIndicators(.hidden)
        .padding(.horizontal, -Self.cardInset)
    }
}
