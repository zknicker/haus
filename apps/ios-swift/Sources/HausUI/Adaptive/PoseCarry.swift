import Foundation
import SwiftUI

/// What a screen holds that must outlive a pose change (specs/ios-app.md,
/// Pose changes). Folding or unfolding the Duo moves every tab between its
/// stack and its split, which mounts its screens afresh. The shell calls
/// `carry()` just before, while the old screens are still mounted, and each
/// new screen takes back what the one under the same key held: a scroll
/// anchor, a focused composer, an open sheet.
@MainActor
public final class PoseCarry {
    private var live: [PoseKey: Holder] = [:]
    private var keys: [UUID: PoseKey] = [:]
    private var carried: [PoseKey: Any] = [:]

    public init() {}

    /// Snapshots every mounted screen's value. What was carried before and
    /// never taken is dropped.
    public func carry() {
        carried = live.compactMapValues { $0.read() }
    }

    /// The reader moved on after a pose change: what no screen took is
    /// stale, and a screen opened later starts fresh.
    public func settle() {
        carried.removeAll()
    }

    /// Registers `token`'s value under `key`, leaving any key it held before:
    /// a composer whose draft changes, beside a Task or back, carries focus
    /// for the new draft only.
    public func register(_ key: PoseKey, token: UUID, read: @escaping @MainActor () -> Any?) {
        unregister(token: token)
        live[key] = Holder(token: token, read: read)
        keys[token] = key
    }

    /// A screen leaving; a newer one registered under its key stays.
    public func unregister(token: UUID) {
        guard let key = keys.removeValue(forKey: token) else { return }
        if live[key]?.token == token { live[key] = nil }
    }

    /// The value carried for `key`, once.
    public func take<Value>(_ key: PoseKey, as type: Value.Type = Value.self) -> Value? {
        carried.removeValue(forKey: key) as? Value
    }

    private struct Holder {
        let token: UUID
        let read: @MainActor () -> Any?
    }
}

/// Names one value on one screen. `scope` is the tab and route the screen
/// draws, the same whether the tab stacks or splits.
public struct PoseKey: Hashable, Sendable {
    public let scope: String
    public let name: String

    public init(scope: String, name: String) {
        self.scope = scope
        self.name = name
    }
}

extension EnvironmentValues {
    @Entry public var poseCarry: PoseCarry? = nil
    @Entry public var poseScope = ""
    /// The draft a screen's composer writes to. Its focus is carried by the
    /// draft, not the screen, so a Task's chip composer folded to the outer
    /// display hands the keyboard to the Task chat, which writes the same draft.
    @Entry public var composerPoseKey: String? = nil
}

extension PoseKey {
    static func composerFocus(_ draft: String?) -> PoseKey? {
        draft.map { PoseKey(scope: "composer", name: $0) }
    }
}

extension View {
    /// Names the screens below by `part` as well, for `PoseKey.scope`.
    public func poseScope(_ part: some CustomStringConvertible) -> some View {
        transformEnvironment(\.poseScope) { $0 += "/\(part.description)" }
    }

    /// Keeps `binding` across a pose change.
    public func carriesAcrossPoses<Value: Equatable>(_ binding: Binding<Value>, as name: String) -> some View {
        carriesAcrossPoses(binding.wrappedValue, as: name) { binding.wrappedValue = $0 }
    }

    /// Keeps `value` across a pose change: the screen mounted after it calls
    /// `restore` with what this one held. `name` is scoped by `poseScope`
    /// unless `key` names the value outright.
    public func carriesAcrossPoses<Value: Equatable>(
        _ value: Value,
        as name: String,
        key: PoseKey? = nil,
        restore: @escaping (Value) -> Void
    ) -> some View {
        modifier(PoseCarrying(value: value, name: name, key: key, restore: restore))
    }
}

private struct PoseCarrying<Value: Equatable>: ViewModifier {
    let value: Value
    let name: String
    let key: PoseKey?
    let restore: (Value) -> Void

    @Environment(\.poseCarry) private var carry
    @Environment(\.poseScope) private var scope
    @State private var slot = PoseSlot()

    func body(content: Content) -> some View {
        content
            .onChange(of: value, initial: true) { _, value in slot.value = value }
            .onAppear {
                guard let carry, let resolvedKey else { return }
                if let carried = carry.take(resolvedKey, as: Value.self) { restore(carried) }
                carry.register(resolvedKey, token: slot.token) { [slot] in slot.value }
            }
            .onChange(of: resolvedKey) { _, key in
                guard let carry else { return }
                guard let key else { return carry.unregister(token: slot.token) }
                carry.register(key, token: slot.token) { [slot] in slot.value }
            }
            .onDisappear { carry?.unregister(token: slot.token) }
    }

    /// A view outside every tab, such as a sheet's, never remounts on a pose
    /// change, so it carries nothing.
    private var resolvedKey: PoseKey? {
        key ?? (scope.isEmpty ? nil : PoseKey(scope: scope, name: name))
    }
}

@MainActor
private final class PoseSlot {
    let token = UUID()
    var value: Any?
}
