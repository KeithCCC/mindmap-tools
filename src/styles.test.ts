import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("responsive inspector layout", () => {
  it("anchors the mobile inspector inside the workspace", () => {
    const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 900px)"));
    const inspectorStyles = Array.from(mobileStyles.matchAll(/\.side-panel\s*\{([^}]*)\}/g)).at(-1)?.[1];

    expect(inspectorStyles).toBeDefined();
    expect(inspectorStyles).toMatch(/position:\s*absolute;/);
    expect(inspectorStyles).toMatch(/top:\s*0;/);
    expect(inspectorStyles).toMatch(/bottom:\s*0;/);
  });
});
