import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Base directory for all Steel configuration and state.
 * Defaults to ~/.steel/ for self-hosted installs.
 * Override with STEEL_HOME env var for managed deployments
 * (e.g. STEEL_HOME=/data/steel on Fly.io volumes).
 * COMPANION_HOME accepted as a legacy alias for migration.
 */
export const COMPANION_HOME =
  process.env.STEEL_HOME || process.env.COMPANION_HOME || join(homedir(), ".steel");
