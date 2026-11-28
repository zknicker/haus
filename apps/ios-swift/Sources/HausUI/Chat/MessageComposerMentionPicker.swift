import SwiftUI

/// The autocomplete card standing on the composer input.
///
/// It is a sibling of the input, not an overlay: same horizontal inset, the composer's own glass,
/// and the resting corner of that family. Rows are grouped under a header naming their kind, so no
/// row has to caption itself, and the first row carries the highlight the way a menu marks the
/// selection it would commit.
struct MessageComposerMentionPicker: View {
    @Binding var text: String
    let options: [MentionOptionPresentation]

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.horizontalSizeClass) private var sizeClass
    /// The box the list was actually given. It is the cap on a roomy screen and less than that
    /// when the composer stack is squeezed, and either way it is what decides the bottom fade.
    @State private var visibleHeight: CGFloat = 0

    /// True while the draft has a live query with something to offer. The composer reads this to
    /// animate its own layout around the card's arrival.
    static func isActive(text: String, options: [MentionOptionPresentation]) -> Bool {
        !MentionPickerLayout.sections(text: text, options: options).isEmpty
    }

    var body: some View {
        let sections = MentionPickerLayout.sections(text: text, options: options)
        if let query = ComposerMentionQuery.active(in: text), !sections.isEmpty {
            card(sections, query: query)
                .transition(reduceMotion ? .opacity : MentionPickerMotion.rise)
        }
    }

    private func card(
        _ sections: [MentionPickerSection],
        query: ComposerMentionQuery
    ) -> some View {
        let activeID = MentionPickerLayout.activeOptionID(in: sections)
        let isScrollable = MentionPickerLayout.overflows(
            sections,
            visibleHeight: visibleHeight
        )
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(sections) { section in
                    MentionPickerSectionView(section: section, activeOptionID: activeID) { option in
                        text = query.inserting(option, into: text)
                    }
                }
            }
        }
        .scrollIndicators(.hidden)
        .scrollDisabled(!isScrollable)
        // `maxHeight`, never a fixed `height`: the card is the one flexible thing in the composer
        // stack, so a screen too short for the whole cap shrinks the list instead of pushing the
        // input down behind the keyboard.
        .frame(maxHeight: MentionPickerLayout.listHeight(of: sections))
        .background {
            GeometryReader { geometry in
                Color.clear
                    .onAppear { visibleHeight = geometry.size.height }
                    .onChange(of: geometry.size.height) { _, height in visibleHeight = height }
            }
        }
        // The cut row at the bottom has to read as the list continuing, not as a row sliced by a
        // straight edge, so the card dissolves its own bottom rather than clipping it.
        .mask(alignment: .top) { bottomFade(isScrollable) }
        .padding(.vertical, MentionPickerLayout.cardVerticalPadding)
        .composerGlassSurface(cornerRadius: ComposerSurfaceMetrics.restingCornerRadius)
        .frame(maxWidth: MentionPickerLayout.maxCardWidth(isRegularWidth: sizeClass == .regular), alignment: .leading)
    }

    /// The fade covers a fixed distance, not a fraction of the box, so the cut row dims by the
    /// same amount whatever the list's height — and it stops short of erasing that row, which is
    /// the row's whole job: to be legible enough to say the list keeps going.
    private func bottomFade(_ isScrollable: Bool) -> some View {
        let start = visibleHeight > MentionPickerLayout.fadeHeight
            ? 1 - (MentionPickerLayout.fadeHeight / visibleHeight)
            : 0.6
        return LinearGradient(
            stops: isScrollable
                ? [
                    .init(color: .black, location: 0),
                    .init(color: .black, location: start),
                    .init(color: .black.opacity(0.22), location: 1),
                ]
                : [.init(color: .black, location: 0), .init(color: .black, location: 1)],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

/// How the card arrives and leaves.
///
/// It rises out of the composer edge — anchored at the bottom, a touch small and a touch low — on a
/// calmer sibling of `ComposerPortalMotion.open`: the portal pops out of a button, this grows off an
/// edge. Leaving reuses the portal's flat, quicker exit, because a dismissal should not linger.
enum MentionPickerMotion {
    static let arrive: Animation = .spring(response: 0.35, dampingFraction: 0.85)
    static let leave: Animation = ComposerPortalMotion.close

    static var rise: AnyTransition {
        .asymmetric(
            insertion: .modifier(
                active: MentionPickerRise(progress: 0, drop: 8),
                identity: MentionPickerRise(progress: 1, drop: 8)
            ),
            removal: .modifier(
                active: MentionPickerRise(progress: 0, drop: 4),
                identity: MentionPickerRise(progress: 1, drop: 4)
            )
        )
    }
}

private struct MentionPickerRise: ViewModifier, @preconcurrency Animatable {
    var progress: Double
    let drop: CGFloat

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    func body(content: Content) -> some View {
        content
            .scaleEffect(0.96 + (0.04 * progress), anchor: .bottom)
            .offset(y: drop * (1 - progress))
            .opacity(progress)
    }
}
