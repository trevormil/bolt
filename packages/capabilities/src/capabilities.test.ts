import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  Authorizer,
  CapabilityStore,
  grantDefaultCapabilities,
  type AuthLedger,
} from "./index.ts";

const store = () => new CapabilityStore(":memory:");

describe("CapabilityStore.decide — default-deny + scope", () => {
  test("denies by default (no grant)", () => {
    const s = store();
    expect(s.decide("p", "fs.read", "/x")).toBe("deny");
    s.close();
  });

  test("allow + ask grants", () => {
    const s = store();
    s.grant({
      personaId: "p",
      capability: "schedule",
      scope: null,
      mode: "allow",
    });
    s.grant({ personaId: "p", capability: "spend", scope: null, mode: "ask" });
    expect(s.decide("p", "schedule")).toBe("allow");
    expect(s.decide("p", "spend")).toBe("ask");
    s.close();
  });

  test("fs.* grants are path-prefix scoped", () => {
    const s = store();
    s.grant({
      personaId: "p",
      capability: "fs.read",
      scope: "/home/u/docs",
      mode: "allow",
    });
    expect(s.decide("p", "fs.read", "/home/u/docs/a.txt")).toBe("allow");
    expect(s.decide("p", "fs.read", "/home/u/docs")).toBe("allow");
    expect(s.decide("p", "fs.read", "/home/u/secrets/k")).toBe("deny"); // outside root
    expect(s.decide("p", "fs.read", "/home/u/docs-evil")).toBe("deny"); // prefix-but-not-under
    s.close();
  });

  test("unscoped grant covers any target; scoped non-fs is exact", () => {
    const s = store();
    s.grant({
      personaId: "p",
      capability: "fs.write",
      scope: null,
      mode: "allow",
    });
    expect(s.decide("p", "fs.write", "/anywhere")).toBe("allow");
    s.grant({
      personaId: "p",
      capability: "mcp",
      scope: "calendar",
      mode: "allow",
    });
    expect(s.decide("p", "mcp", "calendar")).toBe("allow");
    expect(s.decide("p", "mcp", "email")).toBe("deny");
    s.close();
  });

  test("downgrading an unscoped grant (allow→ask) leaves no stale allow row", () => {
    const s = store();
    s.grant({
      personaId: "p",
      capability: "spend",
      scope: null,
      mode: "allow",
    });
    s.grant({ personaId: "p", capability: "spend", scope: null, mode: "ask" });
    expect(s.decide("p", "spend")).toBe("ask"); // not stuck on the old allow
    expect(s.list("p").filter((g) => g.capability === "spend")).toHaveLength(1);
    s.close();
  });

  test("fs scope matching is traversal-safe (resolves ../)", () => {
    const s = store();
    s.grant({
      personaId: "p",
      capability: "fs.read",
      scope: "/home/u/docs",
      mode: "allow",
    });
    expect(s.decide("p", "fs.read", "/home/u/docs/a.txt")).toBe("allow");
    expect(s.decide("p", "fs.read", "/home/u/docs")).toBe("allow"); // exact root
    expect(s.decide("p", "fs.read", "/home/u/docs/../private/key")).toBe(
      "deny",
    ); // escapes
    expect(s.decide("p", "fs.read", "/home/u/docs-evil")).toBe("deny"); // sibling prefix
    expect(s.decide("p", "fs.read", "/home/u/docs/sub/../ok.txt")).toBe(
      "allow",
    ); // stays in
    s.close();
  });

  test("grants are per-persona; revoke removes them", () => {
    const s = store();
    s.grant({
      personaId: "a",
      capability: "spend",
      scope: null,
      mode: "allow",
    });
    expect(s.decide("a", "spend")).toBe("allow");
    expect(s.decide("b", "spend")).toBe("deny"); // not shared
    s.revoke("a", "spend");
    expect(s.decide("a", "spend")).toBe("deny");
    s.close();
  });
});

describe("grantDefaultCapabilities — YOLO default policy (#52)", () => {
  afterEach(() => delete process.env.VELLUM_WORKSPACE);

  test("grants fs.read/fs.write (workspace-scoped) + exec (host-wide, honest)", () => {
    const workspace = "/tmp/vellum-yolo-test-ws";
    process.env.VELLUM_WORKSPACE = workspace;
    const s = store();
    grantDefaultCapabilities(s, "p");

    // Money: unscoped allow (unchanged).
    expect(s.decide("p", "spend")).toBe("allow");
    expect(s.decide("p", "vault.create")).toBe("allow");
    expect(s.decide("p", "vault.withdraw")).toBe("allow");

    // fs.* IS workspace-confined — allowed inside…
    expect(s.decide("p", "fs.read", join(workspace, "a.txt"))).toBe("allow");
    expect(s.decide("p", "fs.write", join(workspace, "sub/b.txt"))).toBe(
      "allow",
    );
    // …and DENIED outside (genuinely scoped + traversal-safe).
    expect(s.decide("p", "fs.read", "/etc/passwd")).toBe("deny");
    expect(s.decide("p", "fs.write", join(workspace, "../escape"))).toBe(
      "deny",
    );

    // exec is UNSCOPED (host-wide) — not a false workspace claim (!56). The grant
    // covers any target (and no target); default-deny still holds without it.
    expect(s.decide("p", "exec")).toBe("allow");
    expect(s.decide("p", "exec", "/some/other/dir")).toBe("allow");
    expect(s.decide("q", "exec")).toBe("deny"); // un-provisioned persona = denied
    s.close();
  });
});

describe("Authorizer", () => {
  function recorder() {
    const records: { authority: string; summary: string }[] = [];
    const ledger: AuthLedger = {
      record: (e) =>
        records.push({ authority: e.authority, summary: e.summary }),
    };
    return { records, ledger };
  }
  const action = { capability: "fs.write", target: "/x", summary: "write /x" };

  test("standing allow → proceeds, recorded as grant", async () => {
    const s = store();
    s.grant({
      personaId: "p",
      capability: "fs.write",
      scope: "/x",
      mode: "allow",
    });
    const { records, ledger } = recorder();
    const auth = new Authorizer(s, { ledger });
    expect(await auth.authorize("p", action)).toBe(true);
    expect(records[0]!.authority).toBe("grant");
    s.close();
  });

  test("ask → approver decides (true)", async () => {
    const s = store();
    s.grant({
      personaId: "p",
      capability: "fs.write",
      scope: "/x",
      mode: "ask",
    });
    const { records, ledger } = recorder();
    const auth = new Authorizer(s, { ledger, approve: () => true });
    expect(await auth.authorize("p", action)).toBe(true);
    expect(records[0]!.authority).toBe("human");
    s.close();
  });

  test("ask → approver rejects (false)", async () => {
    const s = store();
    s.grant({
      personaId: "p",
      capability: "fs.write",
      scope: "/x",
      mode: "ask",
    });
    const { records, ledger } = recorder();
    const auth = new Authorizer(s, { ledger, approve: () => false });
    expect(await auth.authorize("p", action)).toBe(false);
    expect(records[0]!.authority).toBe("rejected");
    s.close();
  });

  test("ask with NO approver fails closed (deny)", async () => {
    const s = store();
    s.grant({
      personaId: "p",
      capability: "fs.write",
      scope: "/x",
      mode: "ask",
    });
    const { records, ledger } = recorder();
    const auth = new Authorizer(s, { ledger });
    expect(await auth.authorize("p", action)).toBe(false);
    expect(records[0]!.authority).toBe("denied");
    s.close();
  });

  test("no grant → deny, recorded", async () => {
    const s = store();
    const { records, ledger } = recorder();
    const auth = new Authorizer(s, { ledger, approve: () => true });
    expect(await auth.authorize("p", action)).toBe(false); // never even asks
    expect(records[0]!.authority).toBe("denied");
    s.close();
  });
});
