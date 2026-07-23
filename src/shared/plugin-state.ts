
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger.js';
import { parseJsonWithBom } from './atomic-json.js';

// ryano-mem: this MUST match the marketplace this fork is actually installed
// under, not upstream's. It was hardcoded to 'claude-mem@thedotmack' — so
// disabling the upstream plugin (to stop its daemon competing with this
// fork's on the same port) silently disabled this fork's daemon too, since
// this check doesn't know the two are different installs. Confirmed live:
// worker-service start/restart exited immediately with no daemon spawned
// and no log line past the disabled-check, right after `claude plugin
// disable claude-mem@thedotmack`.
const PLUGIN_SETTINGS_KEY = 'claude-mem@ryano-mem';

export function isPluginDisabledInClaudeSettings(): boolean {
  try {
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    const settingsPath = join(claudeConfigDir, 'settings.json');
    if (!existsSync(settingsPath)) return false;
    const raw = readFileSync(settingsPath, 'utf-8');
    const settings = parseJsonWithBom<Record<string, any>>(raw);
    return settings?.enabledPlugins?.[PLUGIN_SETTINGS_KEY] === false;
  } catch (error: unknown) {
    logger.error('CONFIG', 'Failed to read Claude settings', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
