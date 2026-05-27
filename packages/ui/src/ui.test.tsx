import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Avatar,
  Badge,
  Button,
  buttonClasses,
  Card,
  Icon,
  iconNames,
  Input,
} from "./index.ts";

describe("@vellum/ui", () => {
  test("buttonClasses maps each variant + size", () => {
    expect(buttonClasses("primary")).toContain("bg-accent");
    expect(buttonClasses("secondary")).toContain("bg-surface");
    expect(buttonClasses("ghost")).toContain("bg-transparent");
    expect(buttonClasses("danger")).toContain("bg-danger");
    expect(buttonClasses("primary", "lg")).toContain("h-[46px]");
    expect(buttonClasses("primary", "sm")).toContain("h-7");
  });

  test("Button renders a <button> with variant classes + children", () => {
    const html = renderToStaticMarkup(<Button variant="primary">Go</Button>);
    expect(html).toContain("<button");
    expect(html).toContain("bg-accent");
    expect(html).toContain("Go");
  });

  test("Icon renders an svg for a known name, nothing for unknown", () => {
    expect(renderToStaticMarkup(<Icon name="chat" />)).toContain("<svg");
    // @ts-expect-error — unknown icon name
    expect(renderToStaticMarkup(<Icon name="does-not-exist" />)).toBe("");
    expect(iconNames.length).toBeGreaterThan(15);
  });

  test("Card / Input / Badge / Avatar render", () => {
    expect(renderToStaticMarkup(<Card>x</Card>)).toContain("bg-surface");
    expect(renderToStaticMarkup(<Input placeholder="p" />)).toContain("<input");
    expect(renderToStaticMarkup(<Badge tone="accent">new</Badge>)).toContain(
      "new",
    );
    expect(renderToStaticMarkup(<Avatar name="Trevor Miller" />)).toContain(
      "TM",
    );
  });
});
