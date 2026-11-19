import Foundation
import Testing
@testable import HausUI

@Suite("Mention picker layout")
struct MentionPickerLayoutTests {
    @Test("Sections read Agents, then Humans, then Channels, then Skills")
    func sectionsFollowKindOrder() {
        let sections = MentionPickerLayout.sections(for: [
            option(id: "skill://ui", kind: .skill),
            option(id: "chat://c", kind: .channel),
            option(id: "user://u", kind: .human),
            option(id: "agent://a", kind: .agent),
        ])

        #expect(sections.map(\.kind) == [.agent, .human, .channel, .skill])
        #expect(sections.map(\.title) == ["Captains", "Humans", "Projects", "Skills"])
    }

    @Test("A kind with nothing to offer gets no header")
    func emptyKindsAreDropped() {
        let sections = MentionPickerLayout.sections(for: [
            option(id: "agent://a", kind: .agent),
            option(id: "agent://b", kind: .agent),
        ])

        #expect(sections.count == 1)
        #expect(sections[0].options.map(\.id) == ["agent://a", "agent://b"])
    }

    @Test("Server order survives grouping and filtering")
    func serverOrderIsPreserved() {
        let roster = [
            option(id: "agent://zoe", kind: .agent, label: "Zoe"),
            option(id: "agent://abe", kind: .agent, label: "Abe"),
            option(id: "user://ann", kind: .human, label: "Ann"),
        ]
        let sections = MentionPickerLayout.sections(text: "hey @a", options: roster)

        #expect(sections.map(\.kind) == [.agent, .human])
        #expect(sections[0].options.map(\.label) == ["Abe"])
        #expect(sections[1].options.map(\.label) == ["Ann"])
    }

    @Test("The trigger chooses the roster")
    func triggerChoosesTheRoster() {
        let roster = [
            option(id: "agent://a", kind: .agent),
            option(id: "chat://product", kind: .channel, label: "product"),
            option(
                id: "skill://agent-browser",
                kind: .skill,
                label: "agent-browser",
                insertText: "agent-browser"
            ),
        ]

        #expect(MentionPickerLayout.sections(text: "@", options: roster).map(\.kind) == [.agent])
        #expect(MentionPickerLayout.sections(text: "#", options: roster).map(\.kind) == [.channel])
        #expect(MentionPickerLayout.sections(text: "$", options: roster).map(\.kind) == [.skill])
        #expect(MentionPickerLayout.sections(text: "no query", options: roster).isEmpty)
    }

    @Test("The active row is the first row of the first section")
    func activeRowIsTheFirstVisibleOption() {
        let sections = MentionPickerLayout.sections(for: [
            option(id: "user://u", kind: .human),
            option(id: "agent://first", kind: .agent),
            option(id: "agent://second", kind: .agent),
        ])

        #expect(MentionPickerLayout.activeOptionID(in: sections) == "agent://first")
        #expect(MentionPickerLayout.activeOptionID(in: []) == nil)
    }

    @Test("Filtering down to one section moves the highlight with it")
    func activeRowFollowsTheFilter() {
        let roster = [
            option(id: "agent://abe", kind: .agent, label: "Abe"),
            option(id: "user://zoe", kind: .human, label: "Zoe"),
        ]
        let sections = MentionPickerLayout.sections(text: "@zo", options: roster)

        #expect(MentionPickerLayout.activeOptionID(in: sections) == "user://zoe")
    }

    @Test("A short list shrinks to content and does not fade")
    func shortListsShrinkToContent() {
        let sections = MentionPickerLayout.sections(for: (0..<3).map {
            option(id: "chat://\($0)", kind: .channel)
        })
        let expected = MentionPickerLayout.headerHeight + (3 * MentionPickerLayout.rowHeight)

        #expect(MentionPickerLayout.contentHeight(of: sections) == expected)
        #expect(MentionPickerLayout.listHeight(of: sections) == expected)
        #expect(MentionPickerLayout.overflows(sections, visibleHeight: expected) == false)
    }

    @Test("A squeezed box fades even when the content is under the cap")
    func aSqueezedBoxStillOverflows() {
        let sections = MentionPickerLayout.sections(for: (0..<3).map {
            option(id: "chat://\($0)", kind: .channel)
        })

        #expect(MentionPickerLayout.overflows(sections, visibleHeight: 0) == false)
        #expect(MentionPickerLayout.overflows(sections, visibleHeight: 120))
    }

    @Test("Past four and a half rows the list caps and scrolls")
    func longListsCapAtFourAndAHalfRows() {
        let sections = MentionPickerLayout.sections(for: (0..<5).map {
            option(id: "chat://\($0)", kind: .channel)
        })

        #expect(MentionPickerLayout.overflows(sections, visibleHeight: 0))
        #expect(MentionPickerLayout.listHeight(of: sections) == MentionPickerLayout.maxContentHeight)
        #expect(
            MentionPickerLayout.maxContentHeight
                == (4.5 * MentionPickerLayout.rowHeight) + MentionPickerLayout.headerHeight
        )
    }

    @Test("A second header counts against the cap")
    func headersCountTowardTheCap() {
        let sections = MentionPickerLayout.sections(for: [
            option(id: "agent://a", kind: .agent),
            option(id: "agent://b", kind: .agent),
            option(id: "user://c", kind: .human),
            option(id: "user://d", kind: .human),
            option(id: "user://e", kind: .human),
        ])

        // Five rows plus two headers clears a cap that allows four and a half rows plus one.
        #expect(MentionPickerLayout.overflows(sections, visibleHeight: 0))
    }

    private func option(
        id: String,
        kind: MentionPresentationKind,
        label: String = "Name",
        insertText: String? = nil
    ) -> MentionOptionPresentation {
        MentionOptionPresentation(
            id: id,
            insertText: insertText ?? label,
            label: label,
            detail: nil,
            kind: kind,
            avatarURL: nil
        )
    }
}
