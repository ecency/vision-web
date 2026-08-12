import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithQueryClient } from "@/specs/test-utils";

// Remote settings from the manage panel: prefill from the served config,
// send ONLY what changed, authorize with the in-place hosting token. A field
// resent unchanged would still be a write, and a blank field must always
// mean "keep the current value".

const mocks = vi.hoisted(() => ({
  tenantConfig: vi.fn(),
  updateTenant: vi.fn(),
  obtainHostingToken: vi.fn()
}));

vi.mock("@/features/hosting-signup/hosting-api", async () => {
  const actual = await vi.importActual<any>("@/features/hosting-signup/hosting-api");
  return {
    ...actual,
    hostingApi: {
      ...actual.hostingApi,
      tenantConfig: mocks.tenantConfig,
      updateTenant: mocks.updateTenant
    }
  };
});

vi.mock("@/features/hosting-signup/hosting-token", () => ({
  obtainHostingToken: mocks.obtainHostingToken
}));

import { TenantSettings } from "@/features/hosting-signup/tenant-settings";
import type { OwnedTenant } from "@/features/hosting-signup/hosting-api";

const ACTIVE_TENANT: OwnedTenant = {
  username: "alice",
  owner: "alice",
  type: "blog",
  subscriptionStatus: "active",
  subscriptionPlan: "standard",
  blogUrl: "https://alice.blogs.ecency.com"
};

describe("TenantSettings remote editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.obtainHostingToken.mockResolvedValue("hosting-jwt");
    mocks.updateTenant.mockResolvedValue({
      message: "Configuration updated",
      published: true
    });
    mocks.tenantConfig.mockResolvedValue({
      configuration: {
        general: { theme: "light", styles: { accent: "#0066cc" } },
        instanceConfiguration: {
          meta: { title: "Alice writes", description: "Notes" }
        }
      }
    });
  });

  it("prefills from the served config and sends only what changed", async () => {
    renderWithQueryClient(<TenantSettings tenant={ACTIVE_TENANT} owner="alice" />);

    // Prefill landed and, with no edits, there is nothing to save.
    const saveBtn = (await screen.findByRole("button", {
      name: "hosting.settings-save"
    })) as HTMLButtonElement;
    await waitFor(() =>
      expect(screen.getByDisplayValue("Alice writes")).toBeTruthy()
    );
    expect(saveBtn.disabled).toBe(true);

    fireEvent.change(screen.getByDisplayValue("Alice writes"), {
      target: { value: "Alice sails" }
    });
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    fireEvent.click(saveBtn);

    await waitFor(() => expect(mocks.updateTenant).toHaveBeenCalled());
    // Only the edited field travels; theme, accent and description are
    // untouched and must not be resent.
    expect(mocks.updateTenant).toHaveBeenCalledWith("alice", "hosting-jwt", {
      title: "Alice sails"
    });
    await screen.findByText("hosting.settings-saved");
  });

  it("edits an activating tenant blind: no prefill, entered fields sent as-is", async () => {
    const inactive = { ...ACTIVE_TENANT, subscriptionStatus: "inactive" as const };
    mocks.updateTenant.mockResolvedValue({
      message: "Configuration saved. It goes live once the subscription is active.",
      published: false
    });
    renderWithQueryClient(<TenantSettings tenant={inactive} owner="alice" />);

    expect(mocks.tenantConfig).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("hosting.settings-theme-label"), {
      target: { value: "dark" }
    });
    const saveBtn = screen.getByRole("button", {
      name: "hosting.settings-save"
    }) as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(mocks.updateTenant).toHaveBeenCalledWith("alice", "hosting-jwt", {
        theme: "dark"
      })
    );
    // Persisting is not publishing: before activation the message must not
    // promise a live site.
    await screen.findByText("hosting.settings-saved-pending");
  });

  it("trusts the PATCH response over a stale listed status", async () => {
    // The tenant activated after the manage list was fetched: the server's
    // published flag is authoritative, so the save reports live, not pending.
    const staleInactive = { ...ACTIVE_TENANT, subscriptionStatus: "inactive" as const };
    mocks.updateTenant.mockResolvedValue({
      message: "Configuration updated",
      published: true
    });
    renderWithQueryClient(<TenantSettings tenant={staleInactive} owner="alice" />);

    fireEvent.change(screen.getByLabelText("hosting.settings-theme-label"), {
      target: { value: "dark" }
    });
    fireEvent.click(screen.getByRole("button", { name: "hosting.settings-save" }));

    await screen.findByText("hosting.settings-saved");
    expect(screen.queryByText("hosting.settings-saved-pending")).toBeNull();
  });

  it("never lets a slow prefill eat keystrokes", async () => {
    let resolveConfig!: (v: unknown) => void;
    mocks.tenantConfig.mockReturnValue(
      new Promise((resolve) => {
        resolveConfig = resolve;
      })
    );
    renderWithQueryClient(<TenantSettings tenant={ACTIVE_TENANT} owner="alice" />);

    // The owner starts typing while the config request is still in flight...
    const inputs = screen.getAllByPlaceholderText("hosting.settings-keep");
    fireEvent.change(inputs[0], { target: { value: "Typed first" } });

    // ...and the prefill that lands afterwards must not replace it.
    resolveConfig({
      configuration: {
        general: { theme: "light", styles: { accent: "#0066cc" } },
        instanceConfiguration: {
          meta: { title: "Alice writes", description: "Notes" }
        }
      }
    });
    await waitFor(() =>
      expect(screen.getByDisplayValue("Notes")).toBeTruthy()
    );
    expect(screen.getByDisplayValue("Typed first")).toBeTruthy();

    // The diff still runs against the fetched snapshot, so the edit travels.
    fireEvent.click(screen.getByRole("button", { name: "hosting.settings-save" }));
    await waitFor(() =>
      expect(mocks.updateTenant).toHaveBeenCalledWith("alice", "hosting-jwt", {
        title: "Typed first"
      })
    );
  });

  it("surfaces a failed save instead of pretending", async () => {
    mocks.updateTenant.mockRejectedValue(new Error("Unauthorized"));
    renderWithQueryClient(<TenantSettings tenant={ACTIVE_TENANT} owner="alice" />);
    await waitFor(() =>
      expect(screen.getByDisplayValue("Alice writes")).toBeTruthy()
    );
    fireEvent.change(screen.getByDisplayValue("Alice writes"), {
      target: { value: "Alice sails" }
    });
    fireEvent.click(screen.getByRole("button", { name: "hosting.settings-save" }));

    await screen.findByText("Unauthorized");
    expect(screen.queryByText("hosting.settings-saved")).toBeNull();
  });
});
