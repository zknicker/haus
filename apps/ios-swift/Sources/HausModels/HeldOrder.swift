import Foundation

/// A list order frozen while someone is touching it.
///
/// The sidebar sorts by latest activity, so a message arriving under the
/// reader's finger moved the row they were about to tap. While held, rows keep
/// the captured order and only their contents update; a row the capture never
/// saw takes its live position. Re-holding adopts the live order.
public struct HeldOrder<ID: Hashable>: Equatable {
    private var positions: [ID: Int]?

    public init() {}

    public var isHeld: Bool { positions != nil }

    public mutating func hold(_ order: [ID]) {
        var captured: [ID: Int] = [:]
        for (index, id) in order.enumerated() where captured[id] == nil {
            captured[id] = index
        }
        positions = captured
    }

    public mutating func release() {
        positions = nil
    }

    public func apply<Item>(_ items: [Item], id: (Item) -> ID) -> [Item] {
        guard let positions else { return items }
        var known: [(position: Int, item: Item)] = []
        var unseen: [(index: Int, item: Item)] = []
        for (index, item) in items.enumerated() {
            if let position = positions[id(item)] {
                known.append((position, item))
            } else {
                unseen.append((index, item))
            }
        }
        var ordered = known.sorted { $0.position < $1.position }.map(\.item)
        for entry in unseen {
            ordered.insert(entry.item, at: min(entry.index, ordered.count))
        }
        return ordered
    }
}
