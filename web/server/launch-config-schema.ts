/**
 * launch-config-schema.ts — JSON Schema and example for .companion/launch.json.
 *
 * Used by the MCP `get_launch_config_schema` tool so agents can learn the
 * expected format before creating or editing a launch config.
 */

// ── JSON Schema ──────────────────────────────────────────────────────────────

export const LAUNCH_CONFIG_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Companion Launch Config",
  description:
    "Configuration for .companion/launch.json — defines setup scripts, background services, and port declarations for a project environment.",
  type: "object" as const,
  required: ["version"],
  properties: {
    version: {
      type: "string",
      description: "Schema version (currently \"1\").",
    },
    setup: {
      type: "array",
      description:
        "Scripts that run once during session creation (e.g. install deps, run migrations). Executed sequentially in order.",
      items: {
        type: "object",
        required: ["name", "command"],
        properties: {
          name: {
            type: "string",
            description: "Human-readable name shown in the UI during setup.",
          },
          command: {
            type: "string",
            description: "Shell command to execute (run via sh -lc).",
          },
          conditions: { $ref: "#/$defs/conditions" },
        },
      },
    },
    services: {
      type: "object",
      description:
        "Background services keyed by name. Started in dependency-aware order after setup scripts complete.",
      additionalProperties: {
        type: "object",
        required: ["command"],
        properties: {
          command: {
            type: "string",
            description: "Shell command to start the service (long-running process).",
          },
          dependsOn: {
            type: "object",
            description:
              "Map of service name → condition. \"started\" waits for the process to spawn. \"ready\" waits for the dependency's readyPattern to match.",
            additionalProperties: {
              type: "string",
              enum: ["started", "ready"],
            },
          },
          readyPattern: {
            type: "string",
            description:
              "Regex pattern matched against service stdout/stderr. When matched, the service is considered ready. Required if another service depends on this one with condition \"ready\".",
          },
          readyTimeout: {
            type: "number",
            description: "Seconds to wait for readyPattern before giving up. Default: 60.",
          },
          conditions: { $ref: "#/$defs/conditions" },
        },
      },
    },
    ports: {
      type: "object",
      description:
        "Port declarations keyed by port number (as string). Used for health monitoring and the Environment panel.",
      additionalProperties: {
        type: "object",
        required: ["label"],
        properties: {
          label: {
            type: "string",
            description: "Human-readable label shown in the Environment panel.",
          },
          protocol: {
            type: "string",
            enum: ["http", "tcp"],
            description: "Health check protocol. Default: \"http\".",
          },
          openOnReady: {
            type: "boolean",
            description: "If true, the port's URL is opened in the browser preview when healthy.",
          },
          healthCheck: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "HTTP path to probe for health checks. Default: \"/\".",
              },
              interval: {
                type: "number",
                description: "Seconds between health checks. Default: 10.",
              },
            },
          },
        },
      },
    },
  },
  $defs: {
    conditions: {
      type: "object",
      description:
        "Optional conditions that control when this item is included. All specified conditions must match. Omit to always include.",
      properties: {
        local: {
          type: "boolean",
          description: "Include only when running locally (not in a sandbox/container).",
        },
        sandbox: {
          type: "boolean",
          description: "Include only when running in a sandbox/container.",
        },
        worktree: {
          type: "boolean",
          description: "Include only when running in a git worktree.",
        },
      },
    },
  },
} as const;

// ── Example ──────────────────────────────────────────────────────────────────

export const LAUNCH_CONFIG_EXAMPLE = {
  version: "1",
  setup: [
    {
      name: "install-deps",
      command: "npm install",
      conditions: { local: true },
    },
    {
      name: "run-migrations",
      command: "npm run db:migrate",
    },
  ],
  services: {
    postgres: {
      command: "docker compose up postgres",
      readyPattern: "database system is ready to accept connections",
      readyTimeout: 30,
      conditions: { local: true },
    },
    api: {
      command: "npm run dev:api",
      dependsOn: { postgres: "ready" },
      readyPattern: "listening on port 3000",
    },
    web: {
      command: "npm run dev:web",
      dependsOn: { api: "started" },
      readyPattern: "ready in \\d+ms",
    },
  },
  ports: {
    "3000": {
      label: "API Server",
      protocol: "http",
      healthCheck: { path: "/health", interval: 15 },
    },
    "5173": {
      label: "Vite Dev Server",
      openOnReady: true,
    },
    "5432": {
      label: "PostgreSQL",
      protocol: "tcp",
    },
  },
};

// ── Response Builder ─────────────────────────────────────────────────────────

/**
 * Build a human-readable response for the `get_launch_config_schema` MCP tool.
 * Includes the JSON Schema, a complete example, and usage notes.
 */
export function buildLaunchSchemaResponse(): string {
  return [
    "# .companion/launch.json Schema",
    "",
    "Place this file at `.companion/launch.json` in your project root.",
    "",
    "## JSON Schema",
    "",
    "```json",
    JSON.stringify(LAUNCH_CONFIG_JSON_SCHEMA, null, 2),
    "```",
    "",
    "## Complete Example",
    "",
    "```json",
    JSON.stringify(LAUNCH_CONFIG_EXAMPLE, null, 2),
    "```",
    "",
    "## Key Concepts",
    "",
    "- **setup**: Scripts run once during session creation (install deps, migrations). Sequential.",
    "- **services**: Long-running background processes (dev servers, databases). Started in dependency order.",
    "  - `dependsOn: { \"db\": \"ready\" }` — waits for db's `readyPattern` to match before starting this service.",
    "  - `dependsOn: { \"db\": \"started\" }` — waits for db process to spawn (not necessarily ready).",
    "- **ports**: Declare which ports to monitor. The Environment panel shows real-time health status.",
    "- **conditions**: Filter items by execution context (`local`, `sandbox`, `worktree`). Omit to always include.",
    "",
    "## Validation",
    "",
    "After creating or editing, run `validate_launch_config` to check for errors.",
    "Run `test_launch_config` to do a full dry-run (starts services, checks ports, then cleans up).",
  ].join("\n");
}
