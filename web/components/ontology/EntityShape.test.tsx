// @vitest-environment jsdom

/**
 * An entity's shape on the Business Atlas, on the entity's own page: shown always, chosen from the whole catalogue
 * while a person is editing. A choice is a shape; what the entity is on the Atlas follows from it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@/lib/testing";
import userEvent from "@testing-library/user-event";

import { SHAPES } from "@/lib/atlas/compose";
import type { ObjectTypeDetail } from "@/lib/objectTypes";

const chose = vi.fn(async () => {});
vi.mock("@/lib/objectTypes", async (orig) => ({ ...(await orig<typeof import("@/lib/objectTypes")>()), chooseEntityShape: (...a: unknown[]) => chose(...(a as [])) }));

import { EntityShape } from "@/components/ontology/EntityShape";

const detail = (drawn_as = "") => ({ id: "Depot", object_type: "depot", display_name: "Depot", drawn_as }) as unknown as ObjectTypeDetail;

beforeEach(() => chose.mockClear());

describe("an entity's shape on the Atlas", () => {
  it("is shown whether or not one is chosen, and offers no change until a person is editing", () => {
    const { rerender } = render(<EntityShape detail={detail()} connectionId="c1" schema="s" editing={false} />);
    expect(screen.getByTestId("entity-shape")).toHaveTextContent("No shape chosen for the Atlas");
    expect(screen.getByTestId("entity-shape").querySelector("svg")).toBeTruthy();                 // the plain block, drawn
    expect(screen.queryByTestId("entity-shape-change")).toBeNull();
    rerender(<EntityShape detail={detail("depot")} connectionId="c1" schema="s" editing={false} />);
    expect(screen.getByTestId("entity-shape")).toHaveTextContent("Drawn on the Atlas as a depot with docks");
    expect(screen.getByTestId("entity-shape")).toHaveTextContent("a person's choice · it says: a place");
    expect(screen.queryByTestId("entity-shape-change")).toBeNull();
  });

  it("opens the whole catalogue while editing, grouped by what a shape says, and saves the one chosen", async () => {
    const onChanged = vi.fn();
    render(<EntityShape detail={detail()} connectionId="c1" schema="s" editing onChanged={onChanged} />);
    await userEvent.click(screen.getByTestId("entity-shape-change"));
    const catalogue = await screen.findByTestId("entity-shape-catalogue");
    for (const shape of Object.keys(SHAPES)) expect(within(catalogue).getByTestId(`entity-shape-${shape}`)).toBeTruthy();   // every shape there is
    expect(within(within(catalogue).getByRole("region", { name: "A place" })).getAllByRole("button").map((b) => b.getAttribute("data-testid")))
      .toEqual(["site", "depot", "airfield", "storefront", "factory", "campus", "terminal", "territory"].map((s) => `entity-shape-${s}`));
    await userEvent.click(within(catalogue).getByTestId("entity-shape-depot"));
    expect(chose).toHaveBeenCalledWith("c1", "Depot", "depot", "s");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("lets go of a choice, and says why when a choice could not be saved", async () => {
    render(<EntityShape detail={detail("depot")} connectionId="c1" schema="s" editing />);
    await userEvent.click(screen.getByTestId("entity-shape-change"));
    const catalogue = await screen.findByTestId("entity-shape-catalogue");
    expect(within(catalogue).getByTestId("entity-shape-depot")).toHaveAttribute("aria-pressed", "true");
    chose.mockRejectedValueOnce(new Error("the draft could not be written"));
    await userEvent.click(within(catalogue).getByTestId("entity-shape-none"));
    expect(chose).toHaveBeenLastCalledWith("c1", "Depot", "", "s");
    expect(await within(catalogue).findByRole("alert")).toHaveTextContent("the draft could not be written");
  });
});
