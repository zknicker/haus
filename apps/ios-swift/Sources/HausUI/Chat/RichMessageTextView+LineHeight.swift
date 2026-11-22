import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// The pitch of a message body's lines, chosen by the transcript layout. The
/// text engine both measures and draws the body, so a line height set here is
/// the row's height too.
public enum RichMessageLineHeight: Hashable, Sendable {
    /// The font's own line box: roster rows and the person's bubbles.
    case natural
    /// Lines this multiple of the body's point size apart, scaling with it.
    case relative(CGFloat)

    /// A Captain's prose in the assistant layout: 17 pt type on 24 pt lines.
    public static let assistantProse = RichMessageLineHeight.relative(24.0 / 17.0)

    /// The height of each line for a body set at `pointSize`; nil keeps the
    /// font's own.
    func lineHeight(pointSize: CGFloat) -> CGFloat? {
        guard case .relative(let multiple) = self else { return nil }
        return (pointSize * multiple).rounded()
    }

    /// `text` with every line set to this height, measured from the point
    /// size of its first run (one block's runs share a size).
    func applied(to text: NSAttributedString) -> NSAttributedString {
        guard text.length > 0,
              let font = text.attribute(.font, at: 0, effectiveRange: nil) as? PlatformFont,
              let height = lineHeight(pointSize: font.pointSize) else { return text }
        let style = NSMutableParagraphStyle()
        style.minimumLineHeight = height
        style.maximumLineHeight = height
        let result = NSMutableAttributedString(attributedString: text)
        result.addAttribute(.paragraphStyle, value: style, range: NSRange(location: 0, length: result.length))
        return result
    }
}

extension EnvironmentValues {
    /// The line height message bodies under this view are set on.
    @Entry public var richMessageLineHeight = RichMessageLineHeight.natural
}
