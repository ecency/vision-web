import { vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient } from "@/specs/test-utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { WitnessesProxy } from "@/app/witnesses/_components/witness-proxy";

const mutateAsync = vi.fn();

vi.mock("@/api/sdk-mutations", () => ({
  useWitnessProxyMutation: () => ({ mutateAsync, isPending: false })
}));

describe("WitnessesProxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue(undefined);
    (useActiveAccount as any).mockReturnValue({
      activeUser: { username: "testuser" },
      username: "testuser"
    });
  });

  const typeName = (value: string) =>
    fireEvent.change(screen.getByPlaceholderText("witnesses.username-placeholder"), {
      target: { value }
    });

  test("sends the bare account name when typed with @ and capitals", async () => {
    const onDone = vi.fn();
    renderWithQueryClient(<WitnessesProxy onDone={onDone} />);

    typeName("@Melinda010100");
    fireEvent.click(screen.getByRole("button", { name: "witnesses.proxy-btn-label" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ proxy: "melinda010100" }));
    expect(onDone).toHaveBeenCalled();
  });

  test("keeps the button disabled for a name the chain would reject", () => {
    renderWithQueryClient(<WitnessesProxy onDone={vi.fn()} />);

    typeName("bad_name");

    expect(screen.getByRole("button", { name: "witnesses.proxy-btn-label" })).toBeDisabled();
  });
});
