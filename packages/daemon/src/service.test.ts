import { describe, expect, test } from "bun:test";
import {
  launchdPlist,
  systemdUnit,
  defaultLogFile,
  LAUNCHD_LABEL,
  DAEMON_ENTRY,
} from "./service.ts";

const spec = {
  bun: "/opt/homebrew/bin/bun",
  repo: "/Users/x/vellum-project",
  logFile: "/Users/x/.vellum/logs/daemon.log",
};

describe("autostart unit generators (#31)", () => {
  test("launchd plist: label, bun+entry args, RunAtLoad+KeepAlive, log paths", () => {
    const p = launchdPlist(spec);
    expect(p).toContain(`<string>${LAUNCHD_LABEL}</string>`);
    expect(p).toContain(`<string>${spec.bun}</string>`);
    expect(p).toContain(`/vellum-project/${DAEMON_ENTRY}</string>`);
    expect(p).toContain("<key>RunAtLoad</key>");
    expect(p).toContain("<key>KeepAlive</key>");
    expect(p).toContain(`<string>${spec.logFile}</string>`);
    // Well-formed-ish: balanced plist envelope.
    expect(p.startsWith("<?xml")).toBe(true);
    expect(p).toContain("</plist>");
  });

  test("systemd unit: ExecStart with bun+entry, Restart=always, log append", () => {
    const u = systemdUnit(spec);
    expect(u).toContain(`ExecStart=${spec.bun} ${spec.repo}/${DAEMON_ENTRY}`);
    expect(u).toContain("Restart=always");
    expect(u).toContain(`WorkingDirectory=${spec.repo}`);
    expect(u).toContain(`append:${spec.logFile}`);
    expect(u).toContain("WantedBy=default.target");
  });

  test("defaultLogFile honors VELLUM_HOME, else ~/.vellum/logs", () => {
    const prev = process.env.VELLUM_HOME;
    try {
      process.env.VELLUM_HOME = "/custom/home";
      expect(defaultLogFile()).toBe("/custom/home/logs/daemon.log");
      delete process.env.VELLUM_HOME;
      expect(defaultLogFile("/Users/y")).toBe(
        "/Users/y/.vellum/logs/daemon.log",
      );
    } finally {
      if (prev === undefined) delete process.env.VELLUM_HOME;
      else process.env.VELLUM_HOME = prev;
    }
  });
});
