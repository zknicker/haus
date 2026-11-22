#if os(iOS)
@preconcurrency import Photos
import SwiftUI
import UIKit

struct ComposerPhotoPickerView: View {
    let maximumSelectionCount: Int
    let onCancel: () -> Void
    let onAdd: ([URL], CGRect?) -> Void

    @Environment(\.displayScale) private var displayScale
    @State private var assets: [PHAsset] = []
    @State private var selectedIDs: [String] = []
    @State private var authorizationDenied = false
    @State private var isExporting = false
    @State private var assetFrames: [String: CGRect] = [:]
    @State private var selectionFeedback = 0

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 2), count: 3)

    var body: some View {
        GeometryReader { proxy in
            let cellSize = ComposerPhotoGridLayout.cellSize(cardWidth: proxy.size.width, displayScale: displayScale)
            ZStack(alignment: .bottom) {
                Group {
                    if authorizationDenied {
                        ContentUnavailableView(
                            "Photos access is off",
                            systemImage: "photo.badge.exclamationmark",
                            description: Text("Allow photo access in Settings to attach a photo.")
                        )
                    } else {
                        photoGrid(
                            cellSize: cellSize,
                            cellPointSize: ComposerPhotoGridLayout.cellPointSize(cardWidth: proxy.size.width)
                        )
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                pickerFooter
            }
            .task { await loadAssets(cellSize: cellSize) }
        }
        .background(.black)
        .coordinateSpace(name: "composer-photo-picker")
        .onPreferenceChange(PhotoAssetFramePreferenceKey.self) { assetFrames = $0 }
        .sensoryFeedback(.selection, trigger: selectionFeedback)
    }

    private func photoGrid(cellSize: CGSize, cellPointSize: CGFloat) -> some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(assets, id: \.localIdentifier) { asset in
                    Button { toggle(asset) } label: {
                        // The explicit square frame is load-bearing: without it, the
                        // `scaledToFill` thumbnail sizes the cell by the photo's native pixels
                        // and the grid renders full-resolution crops.
                        PhotoAssetThumbnail(asset: asset, targetSize: cellSize)
                            .frame(width: cellPointSize, height: cellPointSize)
                            .clipped()
                            // `.clipped()` clips drawing, not hit-testing — without this, a
                            // landscape photo's overflow steals taps from neighboring cells.
                            .contentShape(.rect)
                            .background {
                                GeometryReader { geometry in
                                    Color.clear.preference(
                                        key: PhotoAssetFramePreferenceKey.self,
                                        value: [
                                            asset.localIdentifier: geometry.frame(
                                                in: .named("composer-photo-picker")
                                            )
                                        ]
                                    )
                                }
                            }
                            .overlay(alignment: .topTrailing) {
                                if let index = selectedIDs.firstIndex(of: asset.localIdentifier) {
                                    Text("\(index + 1)")
                                        .font(.caption2.bold())
                                        .foregroundStyle(.white)
                                        .frame(width: 22, height: 22)
                                        .background(HausPlatformColor.accent, in: .circle)
                                        .padding(5)
                                }
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Photo")
                    .accessibilityValue(selectionValue(for: asset))
                }
            }
        }
        .scrollIndicators(.hidden)
        // The keyboard deliberately stays up behind the portal; a drag in the grid must not
        // dismiss it.
        .scrollDismissesKeyboard(.never)
        .contentMargins(.bottom, 76, for: .scrollContent)
    }

    /// Floats over the grid the way the reference does, so photos run to the card's edges. The
    /// resting controls are frosted glass — the grid reads through them — and only a selection
    /// turns the action pill blue.
    private var pickerFooter: some View {
        HStack {
            Button(action: onCancel) {
                Image(systemName: "chevron.left")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial, in: .circle)
                    .overlay { Circle().stroke(.white.opacity(0.22), lineWidth: 0.5) }
                    .shadow(color: .black.opacity(0.35), radius: 10, y: 4)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back to attachments")

            Spacer()

            if selectedIDs.isEmpty {
                Text("All Photos")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 18)
                    .frame(minHeight: 44)
                    .foregroundStyle(.white)
                    .background(.ultraThinMaterial, in: .capsule)
                    .overlay { Capsule().stroke(.white.opacity(0.22), lineWidth: 0.5) }
                    .shadow(color: .black.opacity(0.35), radius: 10, y: 4)
            } else {
                // Plain style with an explicit 44pt capsule: `.borderedProminent` adds its own
                // insets around the label and inflated the pill past the 44pt controls beside it.
                Button(action: exportSelection) {
                    Group {
                        if isExporting {
                            ProgressView().tint(.white).frame(minWidth: 82)
                        } else {
                            Text("Add \(selectedIDs.count) photo\(selectedIDs.count == 1 ? "" : "s")")
                                .font(.subheadline.weight(.semibold))
                        }
                    }
                    .padding(.horizontal, 18)
                    .frame(height: 44)
                    .foregroundStyle(.white)
                    .background(HausPlatformColor.accent, in: .capsule)
                }
                .buttonStyle(.plain)
                .disabled(isExporting)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
        // The card is black regardless of the app's scheme, so the frosted controls resolve dark.
        .environment(\.colorScheme, .dark)
        .animation(.smooth(duration: 0.22), value: selectedIDs.count)
    }

    private func loadAssets(cellSize: CGSize) async {
        switch await ComposerPhotoLibrary.shared.loadForPicker(cellSize: cellSize) {
        case .assets(let loaded):
            assets = loaded
        case .denied:
            authorizationDenied = true
        }
    }

    private func toggle(_ asset: PHAsset) {
        let id = asset.localIdentifier
        if let index = selectedIDs.firstIndex(of: id) {
            selectedIDs.remove(at: index)
            UIAccessibility.post(notification: .announcement, argument: "Photo deselected")
        } else if selectedIDs.count < maximumSelectionCount {
            selectedIDs.append(id)
            UIAccessibility.post(notification: .announcement, argument: "Photo selected")
        }
        selectionFeedback += 1
    }

    private func selectionValue(for asset: PHAsset) -> String {
        guard let index = selectedIDs.firstIndex(of: asset.localIdentifier) else { return "Not selected" }
        return "Selected \(index + 1)"
    }

    private func exportSelection() {
        let selected = selectedIDs.compactMap { id in assets.first { $0.localIdentifier == id } }
        isExporting = true
        Task {
            do {
                var urls: [URL] = []
                for asset in selected { urls.append(try await PhotoAssetExporter.export(asset)) }
                onAdd(
                    urls,
                    selectedIDs.first.flatMap { assetFrames[$0] }
                )
            } catch {
                isExporting = false
            }
        }
    }
}

private struct PhotoAssetFramePreferenceKey: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]

    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, latest in latest })
    }
}

/// Paints the fast/degraded decode immediately and upgrades in place when the full-quality result
/// lands, instead of holding a blank cell for the whole request. `targetSize` arrives already
/// computed by the grid, so no per-cell `GeometryReader` stands between the tap and the request.
private struct PhotoAssetThumbnail: View {
    let asset: PHAsset
    let targetSize: CGSize

    @State private var image: UIImage?
    @State private var isFinal = false
    @State private var requestID: PHImageRequestID?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Color.white.opacity(0.08)
            }
        }
        .task(id: asset.localIdentifier) {
            await requestThumbnail()
        }
        .onDisappear(perform: cancelOutstandingRequest)
    }

    private func requestThumbnail() async {
        if let cached = ComposerPhotoLibrary.shared.cachedThumbnail(for: asset.localIdentifier) {
            image = cached
            isFinal = true
            return
        }
        requestID = ComposerPhotoLibrary.shared.requestThumbnail(
            for: asset,
            targetSize: targetSize
        ) { newImage, final in
            guard !isFinal else { return }
            if let newImage { image = newImage }
            isFinal = final
        }
    }

    private func cancelOutstandingRequest() {
        guard let requestID, !isFinal else { return }
        ComposerPhotoLibrary.shared.cancelThumbnailRequest(requestID)
    }
}

private enum PhotoAssetExporter {
    static func export(_ asset: PHAsset) async throws -> URL {
        guard let resource = PHAssetResource.assetResources(for: asset).first else {
            throw ComposerAttachmentPreparationError.unreadable
        }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("HausPhotoImports", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let filename = ComposerAttachmentStager.sanitizedFilename(resource.originalFilename)
        let destination = directory.appendingPathComponent(filename)
        return try await withCheckedThrowingContinuation { continuation in
            PHAssetResourceManager.default().writeData(for: resource, toFile: destination, options: nil) { error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: destination) }
            }
        }
    }
}
#endif
