import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { createLogger } from "@vellum/shared";
import {
  launchdPlist,
  systemdUnit,
  defaultLogFile,
  LAUNCHD_LABEL,
  SYSTEMD_UNIT,
  type ServiceSpec,
} from "./service.ts";

const log = createLogger("daemon-install");

// Operational installer for the autostart units (#31). Not unit-tested — the
// pure unit *generators* in service.ts are; this just writes them to the right
// path and loads the OS service manager. Run via `bun packages/daemon/src/install.ts`.

function run(cmd: string[]): void {
  const p = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" });
  if (p.exitCode !== 0)
    log.warn(`command exited ${p.exitCode}: ${cmd.join(" ")}`);
}

function spec(): ServiceSpec {
  // The daemon is launched by `bun`; resolve the running bun + repo root.
  const bun = process.execPath; // absolute path to the bun binary
  // This file is packages/daemon/src/install.ts → repo root is three up.
  const repo = resolve(import.meta.dir, "..", "..", "..");
  return { bun, repo, logFile: defaultLogFile() };
}

function installMac(s: ServiceSpec): void {
  const plistPath = join(
    homedir(),
    "Library",
    "LaunchAgents",
    `${LAUNCHD_LABEL}.plist`,
  );
  mkdirSync(dirname(s.logFile), { recursive: true });
  mkdirSync(dirname(plistPath), { recursive: true });
  writeFileSync(plistPath, launchdPlist(s));
  // Reload: bootout (ignore if not loaded) then bootstrap.
  const domain = `gui/${process.getuid?.() ?? ""}`;
  run(["launchctl", "bootout", domain, plistPath]);
  run(["launchctl", "bootstrap", domain, plistPath]);
  log.info(`installed launchd agent → ${plistPath}`);
  log.info(`logs → ${s.logFile}`);
}

function uninstallMac(): void {
  const plistPath = join(
    homedir(),
    "Library",
    "LaunchAgents",
    `${LAUNCHD_LABEL}.plist`,
  );
  const domain = `gui/${process.getuid?.() ?? ""}`;
  run(["launchctl", "bootout", domain, plistPath]);
  if (existsSync(plistPath)) rmSync(plistPath);
  log.info(`removed launchd agent ${plistPath}`);
}

function installLinux(s: ServiceSpec): void {
  const unitPath = join(homedir(), ".config", "systemd", "user", SYSTEMD_UNIT);
  mkdirSync(dirname(s.logFile), { recursive: true });
  mkdirSync(dirname(unitPath), { recursive: true });
  writeFileSync(unitPath, systemdUnit(s));
  run(["systemctl", "--user", "daemon-reload"]);
  run(["systemctl", "--user", "enable", "--now", SYSTEMD_UNIT]);
  log.info(`installed systemd user unit → ${unitPath}`);
  log.info(`logs → ${s.logFile}`);
}

function uninstallLinux(): void {
  run(["systemctl", "--user", "disable", "--now", SYSTEMD_UNIT]);
  const unitPath = join(homedir(), ".config", "systemd", "user", SYSTEMD_UNIT);
  if (existsSync(unitPath)) rmSync(unitPath);
  run(["systemctl", "--user", "daemon-reload"]);
  log.info(`removed systemd user unit ${unitPath}`);
}

function statusMac(): void {
  run(["launchctl", "list"]);
  log.info(`(grep for ${LAUNCHD_LABEL})`);
}
function statusLinux(): void {
  run(["systemctl", "--user", "status", SYSTEMD_UNIT]);
}

function main(): void {
  const action = process.argv[2] ?? "install";
  const os = platform();
  if (os !== "darwin" && os !== "linux") {
    log.error(`unsupported platform: ${os} (macOS + Linux only)`);
    process.exit(1);
  }
  const s = spec();
  if (action === "install") {
    os === "darwin" ? installMac(s) : installLinux(s);
  } else if (action === "uninstall") {
    os === "darwin" ? uninstallMac() : uninstallLinux();
  } else if (action === "status") {
    os === "darwin" ? statusMac() : statusLinux();
  } else {
    log.error(`unknown action '${action}' (install | uninstall | status)`);
    process.exit(1);
  }
}

if (import.meta.main) main();
