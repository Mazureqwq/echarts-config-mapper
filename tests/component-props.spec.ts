import { describe, expect, it } from "vitest";
import { BUILT_IN_THEMES } from "../src/core/design/library";
import { clearComponentColorOverride, resolveComponentColor, sanitizeHexColor } from "../src/core/components/props";

const tokens = BUILT_IN_THEMES.find((theme) => theme.id === "business-light")!.tokens;

describe("safe component colors", () => {
  it("accepts only six-digit hexadecimal colors", () => {
    expect(sanitizeHexColor("#aBc123")).toBe("#aBc123");
    for (const value of ["red", "#12345", "#12345678", " #123456", "url(https://evil)", null, 12]) {
      expect(sanitizeHexColor(value)).toBeUndefined();
    }
  });

  it("prefers a valid explicit override and otherwise inherits the allow-listed theme token", () => {
    expect(resolveComponentColor("#123456", "accent", tokens, "#000000")).toBe("#123456");
    expect(resolveComponentColor(undefined, "accent", tokens, "#000000")).toBe(tokens.accent);
    expect(resolveComponentColor("not-a-color", "border", tokens, "#000000")).toBe(tokens.border);
  });

  it("uses the safe fallback for unknown or invalid theme tokens", () => {
    expect(resolveComponentColor(undefined, "missing-token" as never, tokens, "#334455")).toBe("#334455");
    expect(resolveComponentColor(undefined, "accent", { ...tokens, accent: "expression(alert(1))" } as never, "#334455")).toBe("#334455");
  });

  it("clears an explicit color key without mutating the persisted props object", () => {
    const props = { fillColor: "#123456", labelField: "name" };
    const reset = clearComponentColorOverride(props, "fillColor");
    expect(reset).toEqual({ labelField: "name" });
    expect(props).toEqual({ fillColor: "#123456", labelField: "name" });
  });
});
