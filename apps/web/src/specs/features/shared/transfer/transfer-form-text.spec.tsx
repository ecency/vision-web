import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TransferFormText } from "@/features/shared/transfer/transfer-form-text";

// `text-${type}` built `text-danger` / `text-muted`, which the Tailwind palette
// does not have, so the error rendered in the body colour (#1742).
describe("TransferFormText", () => {
  it("colours an error with the palette's red", () => {
    const { container } = render(<TransferFormText type="danger" msg="Not enough HIVE" />);
    const small = container.querySelector("small")!;
    expect(small.className).toContain("text-red");
    expect(small.className).not.toContain("text-danger");
  });

  it("mutes help text with the palette's grey", () => {
    const { container } = render(<TransferFormText type="muted" msg="Memo help" />);
    expect(container.querySelector("small")!.className).toContain("text-gray-600");
  });
});
