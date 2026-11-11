// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Door, RemoveAsk } from "./authoring";

describe("the one question before anything is removed", () => {
  it("removes nothing on the first click — only on the answer — and then says so", async () => {
    const remove = vi.fn(async () => undefined);
    const onRemoved = vi.fn();
    render(<RemoveAsk what="the link Order placed by Customer" effect="A question that walks it is refused." remove={remove} onRemoved={onRemoved} testId="x" />);
    await userEvent.click(screen.getByTestId("x"));
    expect(remove).not.toHaveBeenCalled();
    expect(await screen.findByText("Remove the link Order placed by Customer?")).toBeInTheDocument();
    expect(screen.getByText("A question that walks it is refused.")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("remove-yes"));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("keeps it when the person says so", async () => {
    const remove = vi.fn(async () => undefined);
    render(<RemoveAsk what="the rule Completed orders" effect="e" remove={remove} testId="x" />);
    await userEvent.click(screen.getByTestId("x"));
    await userEvent.click(await screen.findByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByTestId("remove-yes")).toBeNull());
    expect(remove).not.toHaveBeenCalled();
  });

  it("stays open and says why when the server refuses", async () => {
    const onRemoved = vi.fn();
    render(<RemoveAsk what="Order" effect="e" remove={async () => { throw new Error("a process still reads it"); }} onRemoved={onRemoved} testId="x" />);
    await userEvent.click(screen.getByTestId("x"));
    await userEvent.click(await screen.findByTestId("remove-yes"));
    expect(await screen.findByRole("alert")).toHaveTextContent("a process still reads it");
    expect(onRemoved).not.toHaveBeenCalled();
  });
});

describe("a door", () => {
  it("draws its form only once it is opened, over the page", async () => {
    function Host() {
      const [open, setOpen] = React.useState(false);
      return <Door open={open} onOpenChange={setOpen} label="New link" title="New link from Order" testId="d"><p>the form</p></Door>;
    }
    render(<Host />);
    expect(screen.queryByText("the form")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "New link" }));
    expect(await screen.findByText("the form")).toBeInTheDocument();
    expect(screen.getByText("New link from Order")).toBeInTheDocument();
  });
});

import React from "react";
