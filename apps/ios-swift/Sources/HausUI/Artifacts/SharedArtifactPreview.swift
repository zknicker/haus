#if os(iOS)
import AVKit
import HausModels
import ImageIO
import QuickLook
import SwiftUI
import UIKit

/// A downloaded artifact drawn by its kind: a raster image in the attachment
/// viewer's zooming scroll view, audio and video in the system player, an
/// HTML page in the sandboxed frame artifact pages use, and everything else in
/// Quick Look, which already reads PDFs, text, Markdown, CSV, code, and office
/// documents better than anything the phone would hand-roll.
struct SharedArtifactPreview: View {
    let artifact: SharedArtifactMetadata
    let file: URL

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        switch artifact.fileKind {
        case .image:
            if let bitmap = Self.bitmap(at: file) {
                AttachmentImageZoomView(bitmap: bitmap, onZoomChange: { _ in })
                    .accessibilityLabel(artifact.title)
            } else {
                SharedArtifactQuickLook(file: file)
            }
        case .video, .audio:
            SharedArtifactPlayer(file: file)
        case .html:
            if let html = try? String(contentsOf: file, encoding: .utf8) {
                VisualWebView(
                    document: ArtifactPageDocument.make(html: html, scheme: colorScheme == .light ? .light : .dark),
                    scrolls: true,
                    onHeight: { _ in }
                )
                .accessibilityLabel(artifact.title)
            } else {
                SharedArtifactQuickLook(file: file)
            }
        case .pdf, .document:
            SharedArtifactQuickLook(file: file)
        }
    }

    /// Decoded at most 4096 pixels on the long edge, oriented, so a camera
    /// original neither blows the memory budget nor lies on its side.
    private static func bitmap(at url: URL) -> CGImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 4096,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}

/// The system player over a local file, created once per sheet.
private struct SharedArtifactPlayer: View {
    let file: URL
    @State private var player: AVPlayer?

    var body: some View {
        VideoPlayer(player: player)
            .onAppear { if player == nil { player = AVPlayer(url: file) } }
            .onDisappear { player?.pause() }
    }
}

/// Quick Look embedded as the sheet's body rather than presented over it, so
/// the header and Done stay where they are.
private struct SharedArtifactQuickLook: UIViewControllerRepresentable {
    let file: URL

    func makeCoordinator() -> Coordinator { Coordinator(file: file) }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: QLPreviewController, context: Context) {
        guard context.coordinator.file != file else { return }
        context.coordinator.file = file
        controller.reloadData()
    }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        var file: URL

        init(file: URL) { self.file = file }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            file as NSURL
        }
    }
}
#endif
