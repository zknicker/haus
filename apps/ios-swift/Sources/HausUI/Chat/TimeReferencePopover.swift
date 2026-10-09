#if canImport(UIKit)
import SwiftUI
import UIKit

/// The details a tapped time chip opens: the instant in the viewer's own zone
/// and in the handful of zones a team schedules across.
///
/// A system popover anchored on the chip, kept a popover on iPhone too — it is
/// a glance, not a destination, so it never takes a sheet. Transcript rows are
/// hosted in `UIHostingConfiguration` cells with no view controller of their
/// own, so it presents from the nearest controller up the responder chain.
@MainActor
enum TimeReferencePopover {
    static func present(
        _ reference: RichReferencePresentation,
        from textView: UITextView,
        characterRange: NSRange
    ) {
        guard let span = TimeReference.span(reference.id),
              let presenter = presentingController(for: textView)
        else { return }
        let zone = reference.viewerTimeZone ?? .current
        let details = TimeReferenceDetails(
            title: TimeReference.chipLabel(span.startsAt, end: span.endsAt, zone: zone),
            meta: TimeReference.fromNow(span.startsAt, zone: zone),
            lines: TimeReference.zoneLines(span.startsAt, end: span.endsAt, viewerZone: zone)
        )
        let controller = UIHostingController(rootView: details)
        controller.modalPresentationStyle = .popover
        controller.preferredContentSize = controller.sizeThatFits(
            in: CGSize(width: 340, height: CGFloat.greatestFiniteMagnitude)
        )
        if let popover = controller.popoverPresentationController {
            popover.sourceView = textView
            popover.sourceRect = chipRect(in: textView, characterRange: characterRange)
            popover.permittedArrowDirections = [.up, .down]
            popover.delegate = CompactPopoverDelegate.shared
        }
        presenter.present(controller, animated: true)
    }

    /// The chip's first line fragment, in the text view's coordinates: a chip
    /// wrapped across two lines anchors on the half the reader starts at.
    private static func chipRect(in textView: UITextView, characterRange: NSRange) -> CGRect {
        let layoutManager = textView.layoutManager
        let glyphs = layoutManager.glyphRange(forCharacterRange: characterRange, actualCharacterRange: nil)
        var first: CGRect?
        layoutManager.enumerateEnclosingRects(
            forGlyphRange: glyphs,
            withinSelectedGlyphRange: NSRange(location: NSNotFound, length: 0),
            in: textView.textContainer
        ) { rect, stop in
            first = rect
            stop.pointee = true
        }
        let inset = textView.textContainerInset
        return (first ?? textView.bounds).offsetBy(dx: inset.left, dy: inset.top)
    }

    private static func presentingController(for view: UIView) -> UIViewController? {
        var responder: UIResponder? = view
        while let current = responder, !(current is UIViewController) {
            responder = current.next
        }
        var controller = responder as? UIViewController
        while let presented = controller?.presentedViewController, !presented.isBeingDismissed {
            controller = presented
        }
        return controller
    }
}

/// Keeps the popover a popover in a compact width, where UIKit would otherwise
/// promote it to a full sheet.
private final class CompactPopoverDelegate: NSObject, UIPopoverPresentationControllerDelegate {
    @MainActor static let shared = CompactPopoverDelegate()

    func adaptivePresentationStyle(
        for controller: UIPresentationController,
        traitCollection: UITraitCollection
    ) -> UIModalPresentationStyle {
        .none
    }
}

/// The App's hover card: the chip's own words and how far off they are, then
/// one line per zone — whose time it is above, the full moment below.
struct TimeReferenceDetails: View {
    let title: String
    let meta: String
    let lines: [TimeReference.ZoneLine]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Text(meta)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            ForEach(lines, id: \.self) { line in
                VStack(alignment: .leading, spacing: 2) {
                    Text(line.title)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text(line.text)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
#endif
