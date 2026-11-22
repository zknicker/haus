import Foundation

public enum NullableChange<Value: Encodable & Equatable & Sendable>: Equatable, Sendable {
    case clear
    case set(Value)
}

extension KeyedEncodingContainer {
    mutating func encodeIfPresent<Value>(_ change: NullableChange<Value>?, forKey key: Key) throws {
        switch change {
        case .clear: try encodeNil(forKey: key)
        case let .set(value): try encode(value, forKey: key)
        case nil: break
        }
    }
}
