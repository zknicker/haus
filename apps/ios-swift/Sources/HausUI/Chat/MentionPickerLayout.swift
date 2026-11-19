import CoreGraphics
import Foundation

/// One kind's worth of autocomplete rows, under the header that names the kind.
struct MentionPickerSection: Identifiable, Equatable {
    let kind: MentionPresentationKind
    let title: String
    let options: [MentionOptionPresentation]

    var id: MentionPresentationKind { kind }
}

/// How the mention card is built and measured.
///
/// The trigger chooses the roster — `@` addresses Agents and humans, `#` addresses channels, `$`
/// addresses Skills — and the typed term filters within it. What survives is grouped by kind,
/// because a card that names its groups no longer has to repeat the kind on every row.
///
/// Everything here is pure: the view reads the sections and the heights it should lay out to.
enum MentionPickerLayout {
    /// The card is a step above transcript density, never above the input's. A row reads at the
    /// composer's own text size, so the card belongs to the composer rather than looming over it.
    static let rowHeight: CGFloat = 44
    static let headerHeight: CGFloat = 26
    static let markSize: CGFloat = 22
    static let markGap: CGFloat = 10
    /// The row's own inset inside the highlight, and the highlight's inset inside the card. A
    /// label therefore sits `highlightInset + rowInset` from the card edge, and the header lines up
    /// with it.
    static let rowInset: CGFloat = 10
    static let highlightInset: CGFloat = 5
    /// The highlight keeps the row's radius-to-height ratio, so shrinking the row shrinks its
    /// corner with it rather than leaving the shape behind.
    static let highlightCornerRadius: CGFloat = 14
    static let cardVerticalPadding: CGFloat = 8
    /// Half a row is deliberate: the cut row is the affordance that says the list continues.
    static let maxVisibleRows: CGFloat = 4.5
    /// How far up the card's bottom edge dissolves that cut row.
    static let fadeHeight: CGFloat = 30

    /// Sections in the order the card renders them, which is the Server's own roster order. Agents
    /// lead because the `@` roster is mostly theirs; channels are alone under `#` and Skills under
    /// `$`.
    static let kindOrder: [MentionPresentationKind] = [.agent, .human, .channel, .skill]

    static var maxContentHeight: CGFloat { (maxVisibleRows * rowHeight) + headerHeight }

    /// The card's whole content for the draft as it currently reads. Empty means no card.
    static func sections(
        text: String,
        options: [MentionOptionPresentation]
    ) -> [MentionPickerSection] {
        guard let query = ComposerMentionQuery.active(in: text) else { return [] }
        return sections(for: visibleOptions(query: query, options: options))
    }

    static func sections(for options: [MentionOptionPresentation]) -> [MentionPickerSection] {
        kindOrder.compactMap { kind in
            let matching = options.filter { $0.kind == kind }
            guard !matching.isEmpty else { return nil }
            return MentionPickerSection(kind: kind, title: title(for: kind), options: matching)
        }
    }

    /// Server order is the ranking. Filtering only removes rows; it never reorders them.
    static func visibleOptions(
        query: ComposerMentionQuery,
        options: [MentionOptionPresentation]
    ) -> [MentionOptionPresentation] {
        let triggered = options.filter { matches(kind: $0.kind, trigger: query.trigger) }
        let term = query.value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return triggered }
        return triggered.filter {
            [$0.label, $0.insertText, $0.detail ?? ""]
                .joined(separator: " ")
                .lowercased()
                .contains(term)
        }
    }

    /// The row wearing the highlight: the first row of the first section, which is what a Return
    /// would take if the picker ever grows a keyboard commit.
    static func activeOptionID(in sections: [MentionPickerSection]) -> String? {
        sections.first?.options.first?.id
    }

    static func contentHeight(of sections: [MentionPickerSection]) -> CGFloat {
        sections.reduce(0) { total, section in
            total + headerHeight + (CGFloat(section.options.count) * rowHeight)
        }
    }

    /// A list taller than the box it was given scrolls, and only then does its bottom edge fade.
    ///
    /// The box is the cap on a roomy screen and less than that when the composer stack is
    /// squeezed, so one rule covers both: the fade means "there is more below", never "this list
    /// reached a particular number".
    static func overflows(_ sections: [MentionPickerSection], visibleHeight: CGFloat) -> Bool {
        guard visibleHeight > 0 else { return contentHeight(of: sections) > maxContentHeight }
        return contentHeight(of: sections) > visibleHeight + 0.5
    }

    static func listHeight(of sections: [MentionPickerSection]) -> CGFloat {
        min(contentHeight(of: sections), maxContentHeight)
    }

    static func title(for kind: MentionPresentationKind) -> String {
        switch kind {
        case .agent: "Captains"
        case .channel: "Projects"
        case .human: "Humans"
        case .skill: "Skills"
        // Reference-only kinds never reach a picker section.
        default: ""
        }
    }

    private static func matches(kind: MentionPresentationKind, trigger: Character) -> Bool {
        switch kind {
        case .channel: trigger == "#"
        case .agent, .human: trigger == "@"
        case .skill: trigger == "$"
        // Reference-only kinds never reach a picker section.
        default: false
        }
    }
}
