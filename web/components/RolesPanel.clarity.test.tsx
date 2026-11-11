// @vitest-environment jsdom
/**
 * Settings ▸ Access, redone to CLARITY (2026-10-12). Pinned: the figures row (who you are, the assignments, the
 * function groups, how much of the ledger carries a person), the two rules "Needs you" holds — no recorded call
 * carries a user; a function group has no members, with the button that opens it — and the one muted line when
 * neither holds. A role's permissions are behind its Details, not printed for every role.
 */
import { change, fireEvent, render, screen, waitFor, within } from "@/lib/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminUsers, GroupsCatalogue } from "@/lib/api";

const api = vi.hoisted(() => ({
  getMyAccess: vi.fn(), getRoleCatalogue: vi.fn(), getAdminUsers: vi.fn(), getGroups: vi.fn(),
  getActionTriggers: vi.fn(), getRoleAssignments: vi.fn(), getGroupMembers: vi.fn(), getLevelGrants: vi.fn(),
  assignRole: vi.fn(), revokeRole: vi.fn(), saveGroup: vi.fn(), deleteGroup: vi.fn(), addGroupMember: vi.fn(),
  removeGroupMember: vi.fn(), addLevelGrant: vi.fn(), removeLevelGrant: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

import { RolesPanel } from "./RolesPanel";

const OWNER_PERMS = ["admin.manage_org", "admin.manage_roles", "analysis.run", "resource.read"];
const GROUPS: GroupsCatalogue = {
  ladder: ["view", "subscribe", "edit"],
  builtin_groups: [
    { id: "viewer", name: "Viewer", kind: "builtin", description: "", channel_trigger_id: "", levels: { "*": "view" } },
    { id: "owner", name: "Owner", kind: "builtin", description: "", channel_trigger_id: "", levels: { "*": "own" } },
  ],
  groups: [{ id: "supply-chain", name: "Supply chain", kind: "function", description: "", channel_trigger_id: "" }],
};
const users = (over: Partial<AdminUsers> = {}): AdminUsers => ({
  org_id: "default", users: [], total_calls: 2223, unattributed_calls: 2223, coverage: 0,
  identity_required: false, oidc_configured: false, ...over,
});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.getMyAccess.mockResolvedValue({ user_id: null, actor: "amit", signed_in: false, org_id: "default",
    roles: ["owner"], permissions: OWNER_PERMS });
  api.getRoleCatalogue.mockResolvedValue([
    { name: "viewer", label: "Viewer", description: "Read-only access.", permissions: ["resource.read"] },
    { name: "owner", label: "Owner", description: "Full control.", permissions: OWNER_PERMS },
  ]);
  api.getAdminUsers.mockResolvedValue(users());
  api.getGroups.mockResolvedValue(GROUPS);
  api.getActionTriggers.mockResolvedValue([]);
  api.getRoleAssignments.mockResolvedValue([{ org_id: "default", user_id: "mallory", role: "owner", created_at: "", updated_at: "" }]);
  api.getGroupMembers.mockResolvedValue([]);
  api.getLevelGrants.mockResolvedValue([]);
});

const value = (id: string) => screen.getByTestId(`${id}-value`);

describe("Settings ▸ Access", () => {
  it("opens on who you are, the assignments, the groups and the share of calls attributed", async () => {
    render(<RolesPanel />);
    await waitFor(() => expect(value("fig-you")).toHaveTextContent("Owner"));
    expect(screen.getByTestId("fig-you")).toHaveTextContent("amit · not signed in · org default");
    expect(value("fig-assignments")).toHaveTextContent("1");
    expect(screen.getByTestId("fig-assignments")).toHaveTextContent("1 Owner");
    expect(value("fig-groups")).toHaveTextContent("1");
    expect(value("fig-attributed")).toHaveTextContent("0%");
    expect(screen.getByTestId("fig-attributed")).toHaveTextContent("of 2,223 recorded calls");
  });

  it("needs you for calls that carry no user, and for a group with no members — whose button opens it", async () => {
    render(<RolesPanel />);
    const attribution = await screen.findByTestId("needs-attribution");
    expect(attribution).toHaveTextContent("No recorded call carries a user");
    expect(attribution).toHaveTextContent("Attribution starts once OIDC is configured");
    const empty = await screen.findByTestId("needs-empty-group");
    expect(empty).toHaveTextContent("Supply chain has no members");
    fireEvent.click(within(empty).getByRole("button", { name: "Add members" }));
    await waitFor(() => expect(api.getLevelGrants).toHaveBeenCalledWith({ principal: "group:supply-chain" }));
    // A manager lands in the Add member dialog, the group open behind it.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Add a member to Supply chain")).toBeInTheDocument();
  });

  it("says nothing needs you when calls carry people and every group has members", async () => {
    api.getAdminUsers.mockResolvedValue(users({ coverage: 0.5, unattributed_calls: 1000 }));
    api.getGroupMembers.mockResolvedValue(["user:ana@corp"]);
    render(<RolesPanel />);
    await waitFor(() => expect(screen.getByTestId("access-needs")).toHaveAttribute("data-waiting", "false"));
    expect(screen.getByTestId("access-needs")).toHaveTextContent("Nothing needs you");
    expect(screen.queryByTestId("needs-attribution")).toBeNull();
    expect(screen.queryByTestId("needs-empty-group")).toBeNull();
  });

  it("keeps each role's permissions behind its Details", async () => {
    render(<RolesPanel />);
    const roles = await screen.findByTestId("access-roles");
    expect(within(roles).queryByText("admin.manage_roles")).toBeNull();
    fireEvent.click(within(roles).getByRole("button", { name: /^4 permissions/ }));
    expect(within(roles).getByText("admin.manage_roles")).toBeInTheDocument();
  });
});

// The user, 2026-11-07: a new group and a new member are written in a dialog over the page, opened by their button.
describe("Settings ▸ Access — creating is a dialog", () => {
  it("Create group opens a dialog holding the form; Cancel closes it", async () => {
    render(<RolesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Create group" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("data-testid", "group-new");
    expect(within(dialog).getByPlaceholderText("new group id (e.g. supply-chain)")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.saveGroup).not.toHaveBeenCalled();
  });

  it("creates the group and closes; a refusal is said inside the dialog, which stays open", async () => {
    api.saveGroup.mockRejectedValueOnce(new Error("group ids are lowercase words")).mockResolvedValueOnce({});
    render(<RolesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Create group" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Group id"), { target: { value: "Ops" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create group" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("group ids are lowercase words");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.saveGroup).toHaveBeenLastCalledWith({ id: "ops", channel_trigger_id: "" });
  });

  it("Add member opens a dialog on the open group; Cancel closes it", async () => {
    render(<RolesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Open" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add member" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("data-testid", "group-member-new");
    expect(within(dialog).getByLabelText("Add a member to Supply chain")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.addGroupMember).not.toHaveBeenCalled();
  });
});

// The user, 2026-11-07: a role assignment and a group's grant are written in a dialog over the page too — no form
// stands open on the cards.
describe("Settings ▸ Access — assigning a role and granting a level are dialogs", () => {
  // `hidden`: while a dialog is open, the page behind it is hidden from the accessibility tree.
  const roster = () => screen.getByRole("region", { name: "Role assignments", hidden: true });

  it("Assign a role opens a dialog holding the user id and the role; Cancel leaves the roster as it was", async () => {
    render(<RolesPanel />);
    const open = await screen.findByRole("button", { name: "Assign a role" });
    expect(open).toHaveAttribute("aria-haspopup", "dialog");
    // No assignment form stands open on the card.
    expect(within(roster()).queryByPlaceholderText("user id (e.g. alice@acme.com)")).toBeNull();
    fireEvent.click(open);
    const dialog = await screen.findByRole("dialog", { name: "Assign a role" });
    expect(dialog).toHaveAttribute("data-testid", "role-assign");
    expect(within(dialog).getByLabelText("User id")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Role" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Assign" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.assignRole).not.toHaveBeenCalled();
    expect(within(roster()).getByText("mallory")).toBeInTheDocument();
  });

  it("a refused assignment is said inside the dialog and goes with it; an accepted one closes it and re-reads the roster",
    async () => {
      api.assignRole.mockRejectedValueOnce(new Error("unknown role: auditor")).mockResolvedValueOnce({});
      render(<RolesPanel />);
      fireEvent.click(await screen.findByRole("button", { name: "Assign a role" }));
      let dialog = await screen.findByRole("dialog", { name: "Assign a role" });
      fireEvent.change(within(dialog).getByLabelText("User id"), { target: { value: "ana@corp" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("unknown role: auditor");
      // The refusal is the dialog's, not the card's.
      expect(within(roster()).queryByRole("alert", { hidden: true })).toBeNull();
      // Closed from its corner, the refusal goes with it.
      fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "Assign a role" }));
      dialog = await screen.findByRole("dialog", { name: "Assign a role" });
      expect(within(dialog).queryByRole("alert")).toBeNull();

      api.getRoleAssignments.mockResolvedValue([
        { org_id: "default", user_id: "mallory", role: "owner", created_at: "", updated_at: "" },
        { org_id: "default", user_id: "ana@corp", role: "owner", created_at: "", updated_at: "" },
      ]);
      fireEvent.change(within(dialog).getByLabelText("User id"), { target: { value: "ana@corp" } });
      change(within(dialog).getByRole("combobox", { name: "Role" }), { target: { value: "owner" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(api.assignRole).toHaveBeenLastCalledWith("ana@corp", "owner");
      expect(await within(roster()).findByText("ana@corp")).toBeInTheDocument();
    });

  it("Add a grant opens a dialog titled for the open group, holding the securable and the level; Cancel closes it",
    async () => {
      render(<RolesPanel />);
      fireEvent.click(await screen.findByRole("button", { name: "Open" }));
      const open = await screen.findByRole("button", { name: "Add a grant" });
      expect(open).toHaveAttribute("aria-haspopup", "dialog");
      // No grant form stands open in the group.
      expect(screen.queryByPlaceholderText(/^securable/)).toBeNull();
      fireEvent.click(open);
      const dialog = await screen.findByRole("dialog", { name: "New grant for Supply chain" });
      expect(dialog).toHaveAttribute("data-testid", "group-grant-new");
      expect(within(dialog).getByLabelText("Securable")).toBeInTheDocument();
      expect(within(dialog).getByRole("combobox", { name: "Level" })).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(api.addLevelGrant).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Add a grant" })).toBeInTheDocument();
    });

  it("a refused grant is said inside the dialog; an accepted one closes it and the group shows the grant", async () => {
    api.addLevelGrant.mockRejectedValueOnce(new Error("no such securable")).mockResolvedValueOnce({});
    render(<RolesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Open" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add a grant" }));
    const dialog = await screen.findByRole("dialog", { name: "New grant for Supply chain" });
    fireEvent.change(within(dialog).getByLabelText("Securable"), { target: { value: "domain:ops" } });
    change(within(dialog).getByRole("combobox", { name: "Level" }), { target: { value: "edit" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Grant" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("no such securable");

    api.getLevelGrants.mockResolvedValue([
      { principal: "group:supply-chain", securable: "domain:ops", level: "edit", created_at: "" },
    ]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Grant" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.addLevelGrant).toHaveBeenLastCalledWith("group:supply-chain", "domain:ops", "edit");
    expect(await screen.findByText("edit · domain:ops")).toBeInTheDocument();
  });
});
