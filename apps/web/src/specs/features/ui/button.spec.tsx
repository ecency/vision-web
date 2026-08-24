import { vi } from "vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Button } from "@ui/button";

describe("Button", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic Rendering", () => {
    it("renders with text content", () => {
      render(<Button>Click me</Button>);
      expect(screen.getByText("Click me")).toBeInTheDocument();
    });

    it("renders as a button element by default", () => {
      render(<Button>Button</Button>);
      const button = screen.getByRole("button");
      expect(button.tagName).toBe("BUTTON");
    });

    it("renders with custom className", () => {
      render(<Button className="custom-class">Button</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("custom-class");
    });

    it("applies default type attribute as button", () => {
      render(<Button>Button</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    });

    it("can set custom type attribute", () => {
      render(<Button type="submit">Submit</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
    });
  });

  describe("Interactions", () => {
    it("calls onClick when clicked", () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Click</Button>);
      fireEvent.click(screen.getByText("Click"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when disabled", () => {
      const onClick = vi.fn();
      render(
        <Button onClick={onClick} disabled>
          Disabled
        </Button>
      );
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("can be disabled", () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("is not disabled by default", () => {
      render(<Button>Enabled</Button>);
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });

  describe("Appearances", () => {
    it("applies primary appearance by default", () => {
      render(<Button>Primary</Button>);
      const button = screen.getByRole("button");
      expect(button.className).toContain("bg-blue-dark-sky");
    });

    it("applies secondary appearance", () => {
      render(<Button appearance="secondary">Secondary</Button>);
      const button = screen.getByRole("button");
      expect(button.className).not.toContain("bg-blue-dark-sky");
    });

    it("applies danger appearance", () => {
      render(<Button appearance="danger">Danger</Button>);
      const button = screen.getByRole("button");
      expect(button.className).toContain("bg-red");
    });

    it("applies outline styles when outline prop is true", () => {
      render(<Button outline>Outline</Button>);
      const button = screen.getByRole("button");
      expect(button.className).toContain("border");
    });
  });

  describe("Sizes", () => {
    it("applies medium size by default", () => {
      render(<Button>Medium</Button>);
      const button = screen.getByRole("button");
      expect(button.className).toContain("px-3");
      expect(button.className).toContain("h-[2.125rem]");
    });

    it("applies extra small size", () => {
      render(<Button size="xs">Extra Small</Button>);
      const button = screen.getByRole("button");
      expect(button.className).toContain("px-2");
      expect(button.className).toContain("h-[2rem]");
    });

    it("applies large size", () => {
      render(<Button size="lg">Large</Button>);
      const button = screen.getByRole("button");
      expect(button.className).toContain("px-4");
      expect(button.className).toContain("h-[2.5rem]");
    });
  });

  describe("Icons", () => {
    it("renders with an icon", () => {
      const icon = <span data-testid="test-icon">Icon</span>;
      render(<Button icon={icon}>With Icon</Button>);
      expect(screen.getByTestId("test-icon")).toBeInTheDocument();
      expect(screen.getByText("With Icon")).toBeInTheDocument();
    });

    it("renders icon on the left when iconPlacement is left", () => {
      const icon = <span data-testid="test-icon">Icon</span>;
      render(
        <Button icon={icon} iconPlacement="left">
          With Icon
        </Button>
      );
      const button = screen.getByRole("button");
      expect(button.className).toContain("flex-row-reverse");
    });

    it("applies custom iconClassName", () => {
      const icon = <span>Icon</span>;
      render(
        <Button icon={icon} iconClassName="custom-icon-class">
          With Icon
        </Button>
      );
      const iconWrapper = screen.getByRole("button").querySelector(".custom-icon-class");
      expect(iconWrapper).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("displays loading spinner when isLoading is true", () => {
      render(<Button isLoading>Loading</Button>);
      const button = screen.getByRole("button");
      const spinner = button.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("displays loadingText when isLoading and loadingText provided", () => {
      render(
        <Button isLoading loadingText="Processing...">
          Submit
        </Button>
      );
      expect(screen.getByText("Processing...")).toBeInTheDocument();
      expect(screen.queryByText("Submit")).not.toBeInTheDocument();
    });

    it("disables button when isLoading", () => {
      render(<Button isLoading>Loading</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("does not call onClick when isLoading", () => {
      const onClick = vi.fn();
      render(
        <Button onClick={onClick} isLoading>
          Loading
        </Button>
      );
      fireEvent.click(screen.getByRole("button"));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("Full Width", () => {
    it("applies full width class when full prop is true", () => {
      render(<Button full>Full Width</Button>);
      const button = screen.getByRole("button");
      expect(button.className).toContain("w-full");
    });

    it("does not apply full width class by default", () => {
      render(<Button>Normal Width</Button>);
      const button = screen.getByRole("button");
      expect(button.className).not.toContain("w-full");
    });
  });

  describe("Link Button", () => {
    it("renders as a link when href prop is provided", () => {
      render(<Button href="/test">Link Button</Button>);
      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/test");
    });

    it("renders link with text content", () => {
      render(<Button href="/test">Go to Test</Button>);
      expect(screen.getByText("Go to Test")).toBeInTheDocument();
    });
  });

  describe("Custom Props", () => {
    it("applies noPadding class when noPadding prop is true", () => {
      render(<Button noPadding>No Padding</Button>);
      const button = screen.getByRole("button");
      expect(button.className).toContain("!p-0");
    });

    it("accepts custom style attribute", () => {
      render(<Button style={{ backgroundColor: "red", color: "white" }}>Styled</Button>);
      const button = screen.getByRole("button");
      // The component merges styles with { outline: "none" }
      expect(button).toHaveAttribute("style");
      expect(button.style.outline).toBe("none");
    });

    it("forwards ref to button element", () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(<Button ref={ref}>Button</Button>);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });
});

describe("Button href prefetch behavior (#1666)", () => {
  /*
    A Button with href used to render a raw next/link, which fires an RSC
    prefetch plus an origin render the moment it scrolls into view. The href
    branch now renders IntentLink: no prefetch on render, prefetch on intent.
  */
  const makeRouter = () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn()
  });

  const renderWithRouter = async (ui: React.ReactElement, router: ReturnType<typeof makeRouter>) => {
    const { AppRouterContext } = await import(
      "next/dist/shared/lib/app-router-context.shared-runtime"
    );
    return render(
      <AppRouterContext.Provider value={router as never}>{ui}</AppRouterContext.Provider>
    );
  };

  it("does not prefetch on render", async () => {
    const router = makeRouter();
    await renderWithRouter(<Button href="/perks">Perks</Button>, router);
    expect(router.prefetch).not.toHaveBeenCalled();
  });

  it("prefetches on hover intent", async () => {
    const router = makeRouter();
    await renderWithRouter(<Button href="/perks">Perks</Button>, router);
    fireEvent.mouseEnter(screen.getByText("Perks").closest("a")!);
    expect(router.prefetch).toHaveBeenCalledWith("/perks", expect.anything());
  });
});
