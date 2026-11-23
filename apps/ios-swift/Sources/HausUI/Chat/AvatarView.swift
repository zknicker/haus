import SwiftUI

public struct AvatarView: View {
    private let name: String
    private let explicitInitials: String?
    private let url: URL?
    private let presence: AgentPresence?
    private let presenceAlignment: Alignment
    private let size: CGFloat
    @State private var imageLoadState = AvatarImageLoadState<AvatarPlatformImage>()

    public init(
        name: String,
        url: URL?,
        initials: String? = nil,
        presence: AgentPresence? = nil,
        presenceAlignment: Alignment = .bottomTrailing,
        size: CGFloat = 36
    ) {
        self.name = name
        explicitInitials = initials
        self.url = url
        self.presence = presence
        self.presenceAlignment = presenceAlignment
        self.size = size
    }

    public var body: some View {
        ZStack(alignment: presenceAlignment) {
            Group {
                if let image = displayedImage {
                    platformImage(image)
                        .resizable()
                        .scaledToFill()
                } else {
                    Circle()
                        .fill(Color.secondary.opacity(0.1))
                        .overlay {
                            Text(initials)
                                .font(.system(size: size * 0.38, weight: .medium))
                                .foregroundStyle(.tint)
                        }
                }
            }
            .frame(width: size, height: size)
            .clipShape(.circle)

            if let presence {
                Circle()
                    .fill(presence.color)
                    .frame(width: presenceDotSize, height: presenceDotSize)
                    .overlay { Circle().stroke(HausPlatformColor.canvas, lineWidth: presenceDotSize > 12 ? 3 : 2) }
                    .offset(x: presenceAlignment == .bottomLeading ? -1 : 1, y: 1)
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel(accessibilityLabel)
        .task(id: url) {
            await loadImage()
        }
    }

    private var displayedImage: AvatarPlatformImage? {
        guard let url else { return nil }
        if let loadedImage = imageLoadState.value(for: url) {
            return loadedImage
        }
        return AvatarImageCache.shared.image(for: url)
    }

    private func platformImage(_ image: AvatarPlatformImage) -> Image {
        #if canImport(UIKit)
        Image(uiImage: image)
        #elseif canImport(AppKit)
        Image(nsImage: image)
        #endif
    }

    private func loadImage() async {
        imageLoadState.begin(url: url)
        guard let url else { return }
        let image = await AvatarImageCache.shared.load(url: url)
        imageLoadState.complete(value: image, for: url, isCancelled: Task.isCancelled)
    }

    private var presenceDotSize: CGFloat {
        min(size * 0.33, 16)
    }

    private var initials: String {
        if let explicitInitials, !explicitInitials.isEmpty {
            return explicitInitials
        }
        let components = name.split(separator: " ").prefix(2)
        return components.compactMap(\.first).map(String.init).joined().uppercased()
    }

    private var accessibilityLabel: String {
        guard let presence else { return name }
        return "\(name), \(presence.accessibilityName)"
    }
}

struct AvatarImageLoadState<Value> {
    private var loaded: (url: URL, value: Value)?
    private var requestedURL: URL?

    mutating func begin(url: URL?) {
        requestedURL = url
        if loaded?.url != url {
            loaded = nil
        }
    }

    mutating func complete(value: Value?, for url: URL, isCancelled: Bool) {
        guard !isCancelled, requestedURL == url, let value else { return }
        loaded = (url, value)
    }

    func value(for url: URL) -> Value? {
        guard loaded?.url == url else { return nil }
        return loaded?.value
    }
}

extension AgentPresence {
    var color: Color {
        switch self {
        case .idle: .green
        case .working: .yellow
        case .error: .gray
        case .offline, .stopped: .gray
        }
    }

    var accessibilityName: String {
        switch self {
        case .idle: "online"
        case .working: "working"
        case .error: "error"
        case .offline: "offline"
        case .stopped: "stopped"
        }
    }
}

#Preview {
    HStack(spacing: 20) {
        AvatarView(name: "Cove", url: nil, presence: .idle, size: 44)
        AvatarView(name: "Cove", url: nil, presence: .working, size: 44)
        AvatarView(name: "Zach Knickerbocker", url: nil, size: 44)
    }
    .padding()
}
