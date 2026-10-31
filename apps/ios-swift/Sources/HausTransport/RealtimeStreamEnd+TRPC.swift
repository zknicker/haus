import Foundation
import HausModels

extension TRPCError {
    /// The coded refusal the Server attached (`data.hausRefusal`). Only
    /// membership, role, and Chat-existence checks carry one; an uncoded
    /// `FORBIDDEN` or `NOT_FOUND` is not a refusal.
    public var realtimeRefusal: RealtimeRefusal? {
        guard case let .object(data) = data else { return nil }
        return data[RealtimeRefusal.dataKey]?.stringValue.flatMap(RealtimeRefusal.init(rawValue:))
    }

    /// The Haus AppSession token expired or was rejected.
    public var isUnauthorized: Bool {
        domainCode == "UNAUTHORIZED" || httpStatus == 401
    }
}

extension RealtimeStreamEnd {
    /// Classifies how a subscription ended: `nil` is the Server completing it.
    public init(error: Error?) {
        guard let error else {
            self = .completed
            return
        }
        guard let trpc = error as? TRPCError else {
            self = .failed
            return
        }
        if let refusal = trpc.realtimeRefusal {
            self = .refused(refusal)
        } else if trpc.isUnauthorized {
            self = .unauthorized
        } else {
            self = .failed
        }
    }
}
