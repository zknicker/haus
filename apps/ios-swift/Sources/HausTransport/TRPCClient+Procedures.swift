import Foundation
import HausModels

extension TRPCClient {
    public func call<Input, Output>(_ procedure: HausProcedure<Input, Output>, _ input: Input) async throws -> Output {
        switch procedure.kind {
        case .query: try await query(procedure.path, input: input)
        case .mutation: try await mutation(procedure.path, input: input)
        }
    }
}
