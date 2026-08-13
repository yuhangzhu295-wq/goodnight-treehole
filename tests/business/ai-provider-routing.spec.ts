// Compatibility entry point retained for existing `pnpm test:ai-routing`
// callers. The policy suite verifies local Ollama discovery, routing and
// failover behavior without requiring the live model daemon in unit tests.
import './ai-provider-policy.spec.js';
