/**
 * mcp-prompt-builder.ts — System prompt snippet for Companion MCP tools.
 *
 * Injected into sessions so agents know they have access to launch config
 * management tools. For Claude Code this is appended via `appendSystemPrompt`;
 * for Codex it's included in the `instructions` field at launch time.
 */

/**
 * Build a concise system prompt describing available Companion MCP tools.
 */
export function buildCompanionMcpPrompt(): string {
  return [
    "You have access to Companion MCP tools for managing .companion/launch.json project environment configs:",
    "- get_launch_config_schema: Get the full schema and example before creating/editing a launch config",
    "- validate_launch_config: Validate an existing .companion/launch.json file",
    "- test_launch_config: Dry-run test that starts services, checks ports, then cleans up",
    "",
    "Use get_launch_config_schema first when asked to create or modify a launch.json.",
  ].join("\n");
}
