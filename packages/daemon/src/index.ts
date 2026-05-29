// @vellum/daemon — the unified local background daemon (#31). One engine hosting
// the web/PWA server + Telegram long-poller in a single process, with
// cross-platform autostart (launchd / systemd). Local-only, loopback-bound.
export { startDaemon } from "./daemon.ts";
export {
  launchdPlist,
  systemdUnit,
  defaultLogFile,
  LAUNCHD_LABEL,
  SYSTEMD_UNIT,
  DAEMON_ENTRY,
  type ServiceSpec,
} from "./service.ts";
