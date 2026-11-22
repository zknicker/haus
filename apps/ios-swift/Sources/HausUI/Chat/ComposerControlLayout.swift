import SwiftUI

/// Keeps composer controls alive while their positions interpolate between compact and focused UI.
///
/// Subviews, in order: the plus, the text field, the toolbar accessory (the model chip, or an empty
/// zero-size view), and send. The accessory rides the controls row beside the plus; the caller
/// hides it while the composer is compact.
struct ComposerControlLayout: Layout {
    var expansion: CGFloat
    /// The tallest the collapsed pill lets its one line of text be. Scaled by
    /// the caller with Dynamic Type, so an accessibility size grows the pill
    /// instead of clipping the placeholder.
    var compactFieldHeightLimit: CGFloat = 24
    /// The collapsed pill's floor, the send circle's diameter at the default
    /// size; scaled by the caller too.
    var compactMinimumHeight: CGFloat = 36
    /// The expanded height while a finger drags the grabber.
    var expandedHeightFloor: CGFloat = 0
    /// True at full height: the expanded card takes every point it is offered.
    var fillsProposedHeight = false

    /// Text zone floor when expanded, so a single line sits close to the controls row
    /// instead of leaving the reference's tall dead space beneath it.
    static let expandedFieldMinimumHeight: CGFloat = 26
    /// Gap between the text zone and the controls row when expanded.
    static let expandedRowSpacing: CGFloat = 14
    /// Breathing room between the shell's inner edge and the text when expanded. With the shell's
    /// own 6pt padding this lands the text 16pt in from the glass edge.
    static let expandedFieldInset: CGFloat = 10
    /// Gap between the plus button and the placeholder in the collapsed pill.
    static let compactFieldGap: CGFloat = 10
    /// Gap between the placeholder and the send button in the collapsed pill.
    static let compactSendGap: CGFloat = 8
    /// Gap between the plus and the toolbar accessory, and between the accessory and send.
    static let accessoryGap: CGFloat = 10

    static func expandedFieldWidth(inWidth width: CGFloat) -> CGFloat {
        max(0, width - (expandedFieldInset * 2))
    }

    static func compactFieldWidth(
        inWidth width: CGFloat,
        attachmentWidth: CGFloat,
        sendWidth: CGFloat
    ) -> CGFloat {
        max(0, width - attachmentWidth - sendWidth - compactFieldGap - compactSendGap)
    }

    /// The expanded height: the draft's natural height, raised to a drag floor or, at full height,
    /// to the offered height — never past what is offered.
    nonisolated static func expandedHeight(
        natural: CGFloat,
        floor: CGFloat,
        offered: CGFloat?,
        fills: Bool
    ) -> CGFloat {
        let fillTarget = fills ? (offered ?? natural) : natural
        let wanted = max(natural, floor, fillTarget)
        guard let offered else { return wanted }
        return min(wanted, max(natural, offered))
    }

    var animatableData: CGFloat {
        get { expansion }
        set { expansion = newValue }
    }

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        guard subviews.count == 4 else { return .zero }
        return metrics(width: proposal.width, height: proposal.height, subviews: subviews).size
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        guard subviews.count == 4 else { return }
        let layout = metrics(width: bounds.width, height: bounds.height, subviews: subviews)

        for (subview, frame) in zip(subviews, layout.frames) {
            subview.place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(frame.size)
            )
        }
    }

    private func metrics(width: CGFloat?, height: CGFloat?, subviews: Subviews) -> Metrics {
        let progress = min(max(expansion, 0), 1)
        let fieldProgress = Self.fieldProgress(for: progress)
        let attachmentSize = subviews[0].sizeThatFits(.unspecified)
        let sendSize = subviews[3].sizeThatFits(.unspecified)
        let proposedWidth = width ?? attachmentSize.width + sendSize.width + 180
        let offeredHeight = height.flatMap { $0.isFinite ? $0 : nil }
        let compactFieldWidth = Self.compactFieldWidth(
            inWidth: proposedWidth,
            attachmentWidth: attachmentSize.width,
            sendWidth: sendSize.width
        )
        let expandedFieldWidth = Self.expandedFieldWidth(inWidth: proposedWidth)
        let naturalFieldHeight = subviews[1].sizeThatFits(
            ProposedViewSize(width: expandedFieldWidth, height: nil)
        ).height
        let compactFieldHeight = min(naturalFieldHeight, compactFieldHeightLimit)
        let controlsHeight = max(attachmentSize.height, sendSize.height)
        let compactHeight = max(compactMinimumHeight, controlsHeight, compactFieldHeight)
        let naturalExpandedHeight = Self.expandedTopHeight(forFieldHeight: naturalFieldHeight)
            + Self.expandedRowSpacing + controlsHeight
        let expandedHeight = Self.expandedHeight(
            natural: naturalExpandedHeight,
            floor: expandedHeightFloor,
            offered: offeredHeight,
            fills: fillsProposedHeight
        )
        let expandedFieldHeight = expandedHeight - Self.expandedRowSpacing - controlsHeight
        let totalHeight = interpolate(compactHeight, expandedHeight, progress: progress)

        // The plus and send are bottom-anchored in both end states, so during the morph they stay
        // glued to the growing shell's bottom edge. Animating their y on its own (faster) schedule
        // made them sag below their resting spot mid-expansion while the height caught up.
        let controlsRowY = Self.controlsRowMinY(totalHeight: totalHeight, controlsHeight: controlsHeight)
        let attachmentFrame = CGRect(
            x: 0,
            y: controlsRowY + (controlsHeight - attachmentSize.height) / 2,
            width: attachmentSize.width,
            height: attachmentSize.height
        )
        let fieldFrame = CGRect(
            x: interpolate(
                attachmentSize.width + Self.compactFieldGap,
                Self.expandedFieldInset,
                progress: fieldProgress
            ),
            y: interpolate((compactHeight - compactFieldHeight) / 2, 0, progress: fieldProgress),
            width: interpolate(compactFieldWidth, expandedFieldWidth, progress: fieldProgress),
            height: interpolate(compactFieldHeight, expandedFieldHeight, progress: fieldProgress)
        )
        let accessoryX = attachmentSize.width + Self.accessoryGap
        let accessoryWidth = max(0, proposedWidth - accessoryX - sendSize.width - Self.accessoryGap)
        let accessorySize = subviews[2].sizeThatFits(ProposedViewSize(width: accessoryWidth, height: nil))
        let accessoryFrame = CGRect(
            x: accessoryX,
            y: controlsRowY + (controlsHeight - accessorySize.height) / 2,
            width: min(accessorySize.width, accessoryWidth),
            height: accessorySize.height
        )
        let sendFrame = CGRect(
            x: proposedWidth - sendSize.width,
            y: controlsRowY + (controlsHeight - sendSize.height) / 2,
            width: sendSize.width,
            height: sendSize.height
        )

        return Metrics(
            size: CGSize(width: proposedWidth, height: totalHeight),
            frames: [attachmentFrame, fieldFrame, accessoryFrame, sendFrame]
        )
    }

    private func interpolate(_ start: CGFloat, _ end: CGFloat, progress: CGFloat) -> CGFloat {
        start + ((end - start) * progress)
    }

    static func expandedTopHeight(forFieldHeight fieldHeight: CGFloat) -> CGFloat {
        max(expandedFieldMinimumHeight, fieldHeight)
    }

    /// The controls row hugs the layout's bottom edge at every expansion value, so the plus and
    /// send never move relative to the shell's bottom while the top edge grows.
    static func controlsRowMinY(totalHeight: CGFloat, controlsHeight: CGFloat) -> CGFloat {
        totalHeight - controlsHeight
    }

    /// The text zone widens and grows late in the expansion, after the shell has begun rising, so
    /// the field never crowds the controls row mid-morph.
    static func fieldProgress(for expansion: CGFloat) -> CGFloat {
        max((min(max(expansion, 0), 1) - 0.45) / 0.55, 0)
    }

    private struct Metrics {
        let size: CGSize
        let frames: [CGRect]
    }
}
