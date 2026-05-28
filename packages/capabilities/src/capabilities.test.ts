import { describe, expect, test } from "bun:test";
import { Authorizer, CapabilityStore, type AuthLedger } from "./index.ts";

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
