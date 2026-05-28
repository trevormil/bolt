import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Pure generators for the OS autostart units (#31). Kept side-effect-free so
 * they're unit-testable; the install script writes + loads them. Vellum is
 * local-only: the daemon binds loopback and the only outbound call is OpenRouter
 * — there is no container, no cloud, no hosted URL.
 */

export interface ServiceSpec {
  /** Absolute path to the `bun` binary. */
  bun: string;
  /** Absolute path to the repo root (where the daemon entry lives). */
  repo: string;
  /** Absolute path to the log file (under ~/.vellum/logs by default). */
  logFile: string;
}

export const LAUNCHD_LABEL = "com.vellum.daemon";
export const SYSTEMD_UNIT = "vellum.service";

/** Daemon entry, relative to the repo root. */
export const DAEMON_ENTRY = "packages/daemon/src/daemon.ts";

/** macOS LaunchAgent plist. RunAtLoad + KeepAlive → starts at login, restarts
 *  on crash. Logs stdout+stderr to the same file. */
export function launchdPlist(spec: ServiceSpec): string {
  const entry = join(spec.repo, DAEMON_ENTRY);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${spec.bun}</string>
    <string>${entry}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${spec.repo}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${spec.logFile}</string>
  <key>StandardErrorPath</key>
  <string>${spec.logFile}</string>
</dict>
</plist>
`;
}

/** Linux systemd *user* unit. Restart=always → restarts on crash;
 *  `systemctl --user enable` wires login autostart. */
export function systemdUnit(spec: ServiceSpec): string {
  const entry = join(spec.repo, DAEMON_ENTRY);
  return `[Unit]
Description=Bolt local agent daemon (web + Telegram)
After=network.target

[Service]
Type=simple
WorkingDirectory=${spec.repo}
ExecStart=${spec.bun} ${entry}
Restart=always
RestartSec=3
StandardOutput=append:${spec.logFile}
StandardError=append:${spec.logFile}

[Install]
WantedBy=default.target
`;
}

/** Default log file location under ~/.vellum/logs (filesystem-first #39). */
export function defaultLogFile(home: string = homedir()): string {
  const base = process.env.VELLUM_HOME ?? join(home, ".vellum");
  return join(base, "logs", "daemon.log");
}
