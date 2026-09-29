#if DEBUG && os(iOS)
import Foundation
import SwiftUI
import UIKit

/// The avatar surfaces a screenshot can reach without a Server.
///
/// Generation is a paid, authenticated, tens-of-seconds operation, so its
/// states are unreachable in a normal Simulator run. Each scene mounts the
/// production view over a fixture `AvatarGenerationSession`.
public enum AvatarGenerationDebugScene: String, CaseIterable, Sendable {
    case generator = "--avatar-generation-preview"
    case generatorFilled = "--avatar-generation-preview-filled"
    case generatorProgress = "--avatar-generation-preview-progress"
    /// Three variants; the counter shows and the stage swipes.
    case generatorVariants = "--avatar-generation-preview-variants"
    /// Two variants and a failed run on its own page.
    case generatorFailed = "--avatar-generation-preview-failed"
    /// A variant whose save failed, with the alert up.
    case generatorSaveError = "--avatar-generation-preview-save-error"
    /// The Agent profile that opens the generator.
    case profile = "--avatar-generation-preview-profile"
    /// The same profile for a factory Agent, which offers no generator.
    case factoryProfile = "--avatar-generation-preview-factory-profile"

    public static func resolve(_ arguments: [String]) -> AvatarGenerationDebugScene? {
        arguments.lazy.compactMap(AvatarGenerationDebugScene.init(rawValue:)).first
    }
}

/// Deterministic screenshot host. It exercises the production avatar UI without
/// authenticating or calling the paid image provider.
public struct AvatarGenerationDebugPreview: View {
    private let scene: AvatarGenerationDebugScene
    @State private var session: AvatarGenerationSession

    public init(scene: AvatarGenerationDebugScene) {
        self.scene = scene
        _session = State(initialValue: Self.fixture(for: scene))
    }

    public var body: some View {
        switch scene {
        case .profile:
            profile(SettingsFixtures.blippy)
        case .factoryProfile:
            profile(SettingsFixtures.cove)
        default:
            AgentAvatarGenerationView(
                agentName: "Blippy",
                currentAvatarURL: nil,
                initials: SettingsFixtures.blippy.initials,
                session: session,
                onGenerate: { _ in
                    try await Task.sleep(for: .seconds(5))
                    return debugAvatar(.systemTeal)
                },
                onSave: { _ in
                    throw DebugSaveFailure()
                }
            )
        }
    }

    private static func fixture(for scene: AvatarGenerationDebugScene) -> AvatarGenerationSession {
        let session = AvatarGenerationSession()
        guard scene != .generator else { return session }
        session.concept = "a moonlit fox cartographer"
        switch scene {
        case .generatorFilled, .generatorSaveError:
            session.receive(debugAvatar(.systemIndigo), runID: session.startRun())
        case .generatorVariants:
            for color in [UIColor.systemIndigo, .systemOrange, .systemPink] {
                session.receive(debugAvatar(color), runID: session.startRun())
            }
        case .generatorFailed:
            for color in [UIColor.systemIndigo, .systemOrange] {
                session.receive(debugAvatar(color), runID: session.startRun())
            }
            session.fail(
                "The image provider couldn't finish this avatar. Try again, or describe the concept a little differently.",
                runID: session.startRun()
            )
        case .generatorProgress:
            session.receive(debugAvatar(.systemIndigo), runID: session.startRun())
            session.startRun()
        default:
            break
        }
        if scene == .generatorSaveError {
            session.saveError = "Haus couldn't be reached. Check your connection and try again."
        }
        return session
    }

    private func profile(_ agent: SettingsAgent) -> some View {
        NavigationStack {
            AgentProfileView(agent: agent, onEditDescription: { _, _ in })
        }
    }
}

private struct DebugSaveFailure: LocalizedError {
    var errorDescription: String? { "Haus couldn't be reached. Check your connection and try again." }
}

private func debugAvatar(_ color: UIColor) -> AvatarImagePayload {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256))
    let data = renderer.pngData { context in
        color.setFill()
        context.fill(CGRect(x: 0, y: 0, width: 256, height: 256))
        let image = UIImage(systemName: "sparkles")?.withTintColor(.white, renderingMode: .alwaysOriginal)
        image?.draw(in: CGRect(x: 64, y: 64, width: 128, height: 128))
    }
    return AvatarImagePayload(data: data, mediaType: .png)
}
#endif
