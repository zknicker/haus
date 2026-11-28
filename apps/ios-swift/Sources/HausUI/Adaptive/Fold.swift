import SwiftUI

/// The Duo's fold in a view's own coordinates, as iOS 27.1 reserves it
/// (`ReservedRegion.Kind.division`, specs/ios-app.md, Half-open). Half open
/// like a book it runs top to bottom; half open on a surface it runs across.
/// The region is reported fully open too, inactive, so a layout can already
/// sit where the fold is and nothing moves when the Duo half opens.
public struct Fold: Equatable, Sendable {
    public enum Direction: Equatable, Sendable {
        /// Top to bottom: panes sit side by side.
        case vertical
        /// Across: panes sit above and below.
        case horizontal
    }

    /// How far every control keeps from an active fold. Haus's choice, not
    /// Apple's.
    public static let clearance: CGFloat = 28

    public let direction: Direction
    /// Where the fold crosses the view: along x for a vertical fold, along y
    /// for a horizontal one.
    public let span: ClosedRange<CGFloat>
    /// Only a half-open Duo reserves the fold.
    public let isActive: Bool

    public init(direction: Direction, span: ClosedRange<CGFloat>, isActive: Bool) {
        self.direction = direction
        self.span = span
        self.isActive = isActive
    }

    public init(frame: CGRect, isActive: Bool) {
        direction = frame.height >= frame.width ? .vertical : .horizontal
        span = direction == .vertical ? frame.minX...frame.maxX : frame.minY...frame.maxY
        self.isActive = isActive
    }

    public var midline: CGFloat {
        ((span.lowerBound + span.upperBound) / 2).rounded(.down)
    }

    /// The view's length across the fold: its width for a vertical fold.
    public func length(of size: CGSize) -> CGFloat {
        direction == .vertical ? size.width : size.height
    }

    /// Whether the fold lies inside `length`, so two panes can meet at it.
    public func divides(_ length: CGFloat) -> Bool {
        span.lowerBound > 0 && span.upperBound < length
    }

    /// The part of `0...length` a control can use: all of it unless an active
    /// fold comes within the clearance, then the larger side, clear of it.
    public static func clearSide(of length: CGFloat, avoiding fold: Fold?) -> ClosedRange<CGFloat> {
        guard let fold, fold.isActive,
              fold.span.upperBound + clearance > 0, fold.span.lowerBound - clearance < length
        else { return 0...max(length, 0) }
        let before = max(fold.span.lowerBound - clearance, 0)
        let after = min(fold.span.upperBound + clearance, length)
        return before >= length - after ? 0...before : after...max(length, after)
    }
}

/// Reads the fold in this view's own coordinates while laying out
/// `content` at the proposed size.
struct FoldReader<Content: View>: View {
    @ViewBuilder let content: (CGSize, Fold?) -> Content

    var body: some View {
        GeometryReader { proxy in
            content(proxy.size, Self.fold(in: proxy))
        }
    }

    private static func fold(in proxy: GeometryProxy) -> Fold? {
        #if os(iOS)
        if #available(iOS 27.1, *) {
            return proxy.reservedRegions(kind: .division, options: .includeInactive)
                .first
                .map { Fold(frame: $0.frame, isActive: $0.isActive) }
        }
        #endif
        return nil
    }
}
