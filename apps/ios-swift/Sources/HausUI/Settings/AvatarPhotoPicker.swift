import Foundation
import SwiftUI

/// The media types accepted by the Server avatar contract.
public enum AvatarImageMediaType: String, Equatable, Sendable {
    case jpeg = "image/jpeg"
    case png = "image/png"
}

/// A processed avatar ready for the app/client mutation layer.
public struct AvatarImagePayload: Equatable, Sendable {
    public let data: Data
    public let mediaType: AvatarImageMediaType

    public init(data: Data, mediaType: AvatarImageMediaType) {
        self.data = data
        self.mediaType = mediaType
    }

    public var byteCount: Int {
        data.count
    }
}

/// Shared image limits. These are deliberately pure so transport and UI tests
/// can validate the contract without importing UIKit.
public enum AvatarImageConstraints {
    public static let pixelSize = 256
    public static let maxBytes = 512 * 1024

    public static func outputDimension(width: Int, height: Int) -> Int {
        guard width > 0, height > 0 else { return 0 }
        return min(pixelSize, min(width, height))
    }

    public static func fits(byteCount: Int) -> Bool {
        byteCount >= 0 && byteCount <= maxBytes
    }
}

public enum AvatarImageProcessingError: LocalizedError, Sendable {
    case invalidImage
    case unsupportedImage
    case cannotFitWithinLimit

    public var errorDescription: String? {
        switch self {
        case .invalidImage:
            "That photo could not be read. Try another image."
        case .unsupportedImage:
            "That photo format is not supported. Try another image."
        case .cannotFitWithinLimit:
            "That photo is too large to use as an avatar. Try a simpler image."
        }
    }
}

#if os(iOS)
import PhotosUI
import UIKit

/// Resizes and center-crops a selected photo to the shared avatar contract.
public enum AvatarImageProcessor {
    public static func process(data: Data) throws -> AvatarImagePayload {
        guard let image = UIImage(data: data), let sourceImage = image.cgImage else {
            throw AvatarImageProcessingError.invalidImage
        }

        let sourceDimension = AvatarImageConstraints.outputDimension(
            width: sourceImage.width,
            height: sourceImage.height
        )
        guard sourceDimension > 0 else {
            throw AvatarImageProcessingError.unsupportedImage
        }

        let dimensions = [sourceDimension, 224, 192, 160, 128, 96, 64, 32]
            .filter { $0 <= sourceDimension }
        let preservesAlpha = hasAlpha(sourceImage)

        for dimension in dimensions {
            let rendered = renderSquare(image, dimension: dimension, opaque: !preservesAlpha)

            if preservesAlpha,
               let pngData = rendered.pngData(),
               AvatarImageConstraints.fits(byteCount: pngData.count)
            {
                return AvatarImagePayload(data: pngData, mediaType: .png)
            }

            for quality in [0.9, 0.75, 0.6, 0.45, 0.3, 0.15, 0.05] {
                guard let jpegData = rendered.jpegData(compressionQuality: quality) else {
                    continue
                }
                if AvatarImageConstraints.fits(byteCount: jpegData.count) {
                    return AvatarImagePayload(data: jpegData, mediaType: .jpeg)
                }
            }
        }

        throw AvatarImageProcessingError.cannotFitWithinLimit
    }

    private static func renderSquare(_ image: UIImage, dimension: Int, opaque: Bool) -> UIImage {
        let sourceSize = image.size
        let cropSide = min(sourceSize.width, sourceSize.height)
        let scale = CGFloat(dimension) / max(cropSide, 1)
        let drawSize = CGSize(width: sourceSize.width * scale, height: sourceSize.height * scale)
        let drawOrigin = CGPoint(
            x: (CGFloat(dimension) - drawSize.width) / 2,
            y: (CGFloat(dimension) - drawSize.height) / 2
        )

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = opaque

        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: dimension, height: dimension),
            format: format
        )
        return renderer.image { context in
            if opaque {
                UIColor.white.setFill()
                context.fill(CGRect(x: 0, y: 0, width: dimension, height: dimension))
            }
            image.draw(in: CGRect(origin: drawOrigin, size: drawSize))
        }
    }

    private static func hasAlpha(_ image: CGImage) -> Bool {
        switch image.alphaInfo {
        case .first, .last, .premultipliedFirst, .premultipliedLast:
            true
        case .none, .noneSkipFirst, .noneSkipLast, .alphaOnly:
            false
        @unknown default:
            false
        }
    }
}

/// A compact system photo picker with processing, pending, and error states.
/// The callback owns the eventual Server/client mutation.
public struct AvatarPhotoPicker: View {
    private let label: String
    private let onImagePicked: @Sendable (AvatarImagePayload) async throws -> Void

    @State private var selectedItem: PhotosPickerItem?
    @State private var isProcessing = false
    @State private var errorMessage: String?

    public init(
        label: String = "Change photo",
        onImagePicked: @escaping @Sendable (AvatarImagePayload) async throws -> Void
    ) {
        self.label = label
        self.onImagePicked = onImagePicked
    }

    public var body: some View {
        let processing = isProcessing

        PhotosPicker(selection: $selectedItem, matching: .images, photoLibrary: .shared()) {
            Group {
                if processing {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    HausIcon(.camera, size: 17, weight: 2)
                }
            }
            .frame(width: 32, height: 32)
            .background(HausPlatformColor.groupedSurface, in: .circle)
            .overlay {
                Circle().stroke(HausPlatformColor.canvas, lineWidth: 2)
            }
        }
        .buttonStyle(.plain)
        .disabled(isProcessing)
        .accessibilityLabel(label)
        .accessibilityHint("Choose a square profile photo")
        .onChange(of: selectedItem) { _, item in
            guard let item else { return }
            Task { await process(item) }
        }
        .alert(
            "Photo unavailable",
            isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Try another photo.")
        }
    }

    private func process(_ item: PhotosPickerItem) async {
        isProcessing = true
        errorMessage = nil

        defer {
            isProcessing = false
            selectedItem = nil
        }

        do {
            guard let sourceData = try await item.loadTransferable(type: Data.self) else {
                throw AvatarImageProcessingError.invalidImage
            }
            let payload = try AvatarImageProcessor.process(data: sourceData)
            try await onImagePicked(payload)
        } catch is CancellationError {
            return
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}
#else

/// Photo selection is an iPhone capability; this fallback keeps the Swift
/// package's macOS previews and tests buildable.
public struct AvatarPhotoPicker: View {
    private let label: String

    public init(
        label: String = "Change photo",
        onImagePicked: @escaping @Sendable (AvatarImagePayload) async throws -> Void
    ) {
        self.label = label
        _ = onImagePicked
    }

    public var body: some View {
        HStack(spacing: 8) {
            HausIcon(.camera, size: 17, weight: 1.8)
            Text(label)
        }
            .foregroundStyle(.secondary)
            .accessibilityHint("Photo selection is available on iPhone")
    }
}
#endif

#Preview("Avatar photo picker") {
    AvatarPhotoPicker { _ in }
}
