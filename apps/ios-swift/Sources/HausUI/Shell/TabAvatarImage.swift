#if canImport(UIKit)
import SwiftUI
import UIKit

/// The You tab's icon: the person's avatar as a circular bitmap, since a tab
/// bar draws only images. Nil until the avatar loads, or when there is none.
@MainActor
public enum TabAvatarImage {
    public static func image(url: URL?, side: CGFloat = 26) async -> Image? {
        guard let url, let source = await AvatarImageCache.shared.load(url: url) else { return nil }
        let bounds = CGRect(x: 0, y: 0, width: side, height: side)
        let rendered = UIGraphicsImageRenderer(size: bounds.size).image { _ in
            UIBezierPath(ovalIn: bounds).addClip()
            source.draw(in: bounds)
        }
        return Image(uiImage: rendered.withRenderingMode(.alwaysOriginal))
    }
}
#endif
