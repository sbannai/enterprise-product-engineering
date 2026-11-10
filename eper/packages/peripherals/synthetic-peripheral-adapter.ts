import type {
  PeripheralAdapter,
  PeripheralCommand,
  PeripheralCommandResult,
  PeripheralConfiguration,
  PeripheralConnectionContext,
} from "./index.js";

/**
 * Local deterministic adapter used only for contract/integration simulation.
 * It performs no network, hardware, discovery, persistence or cloud operations.
 */
export class SyntheticPeripheralAdapter implements PeripheralAdapter {
  async connect(
    _context: PeripheralConnectionContext,
    _configuration: PeripheralConfiguration,
    _signal: AbortSignal,
  ): Promise<void> {
    // Deliberately no-op: a synthetic connection is not a physical device connection.
  }

  async disconnect(_context: PeripheralConnectionContext): Promise<void> {
    // Deliberately no-op: the service lifecycle remains fully exercised.
  }

  async invoke(
    _context: PeripheralConnectionContext,
    command: PeripheralCommand,
    _signal: AbortSignal,
  ): Promise<PeripheralCommandResult> {
    if (!command.idempotencyKey?.trim()) return { outcome: "REJECTED", code: "IDEMPOTENCY_KEY_REQUIRED" };
    return { outcome: "NEEDS_ATTENTION", code: "SYNTHETIC_ADAPTER_COMMANDS_DISABLED" };
  }
}
