import Foundation
import HausModels
import ImageIO
import Intents
import UIKit

/// The sender's face for the banner: the fetched avatar, downscaled, or an
/// initials monogram when there is no avatar or it cannot be fetched.
enum SenderAvatar {
    /// Avatars are at most 2 MiB (docs/internals/avatars.md).
    static let maxBytes = 2 * 1024 * 1024
    static let timeout: TimeInterval = 8
    /// Banner avatars render well under this; decoding the full image would
    /// spend the extension's ~24 MB memory budget.
    private static let maxPixelSize = 256

    static func image(for sender: PushNotificationCommunication.Sender) async -> INImage? {
        if let url = sender.avatarURL, let data = await fetchThumbnail(url) {
            return INImage(imageData: data)
        }
        return monogram(sender.initials).map(INImage.init(imageData:))
    }

    private static func fetchThumbnail(_ url: URL) async -> Data? {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = timeout
        configuration.timeoutIntervalForResource = timeout
        let session = URLSession(configuration: configuration)
        defer { session.finishTasksAndInvalidate() }
        do {
            // Download to disk so an oversized body never lands in memory.
            let (file, response) = try await session.download(from: url)
            defer { try? FileManager.default.removeItem(at: file) }
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
            let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? .max
            guard size > 0, size <= maxBytes else { return nil }
            return thumbnailPNG(at: file)
        } catch {
            NotificationService.logger.error("avatar fetch failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private static func thumbnailPNG(at file: URL) -> Data? {
        guard let source = CGImageSourceCreateWithURL(file as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: thumbnail).pngData()
    }

    private static func monogram(_ initials: String) -> Data? {
        let side = CGFloat(maxPixelSize) / 2
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
        let image = renderer.image { _ in
            let bounds = CGRect(x: 0, y: 0, width: side, height: side)
            UIColor.systemGray.setFill()
            UIBezierPath(rect: bounds).fill()
            let text = NSAttributedString(
                string: initials,
                attributes: [
                    .font: UIFont.systemFont(ofSize: side * 0.4, weight: .semibold),
                    .foregroundColor: UIColor.white,
                ]
            )
            let size = text.size()
            text.draw(at: CGPoint(x: (side - size.width) / 2, y: (side - size.height) / 2))
        }
        return image.pngData()
    }
}
