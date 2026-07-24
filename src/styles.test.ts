import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function getRuleBody(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1];
}

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

describe("AI dialog styling", () => {
  it("defines bounded desktop dialog and scrollable content rules", () => {
    const backdropStyles = getRuleBody(styles, ".ai-dialog-backdrop");
    const dialogStyles = getRuleBody(styles, ".ai-dialog");
    const contentStyles = getRuleBody(styles, ".ai-dialog-content");
    const tabStyles = getRuleBody(styles, ".tabs");

    expect(backdropStyles).toMatch(/position:\s*fixed;/);
    expect(backdropStyles).toMatch(/inset:\s*0;/);
    expect(dialogStyles).toMatch(/max-height:\s*calc\(100vh - 48px\);/);
    expect(dialogStyles).toMatch(/width:\s*min\(520px, calc\(100vw - 48px\)\);/);
    expect(contentStyles).toMatch(/overflow-y:\s*auto;/);
    expect(tabStyles).toMatch(/grid-template-columns:\s*repeat\(4, 1fr\);/);
  });

  it("uses the dark palette for the AI dialog header border", () => {
    const darkHeaderStyles = getRuleBody(styles, ".theme-dark .ai-dialog-header");

    expect(darkHeaderStyles).toMatch(/border-bottom-color:\s*#334155;/);
  });

  it("defines mobile dialog dimensions within the mobile media query", () => {
    const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 900px)"));
    const mobileBackdropStyles = getRuleBody(mobileStyles, ".ai-dialog-backdrop");
    const mobileDialogStyles = getRuleBody(mobileStyles, ".ai-dialog");

    expect(mobileBackdropStyles).toMatch(/padding:\s*12px;/);
    expect(mobileDialogStyles).toMatch(/max-height:\s*calc\(100vh - 24px\);/);
    expect(mobileDialogStyles).toMatch(/width:\s*calc\(100vw - 24px\);/);
  });
});
