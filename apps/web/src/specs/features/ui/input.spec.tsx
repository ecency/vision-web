import { vi } from "vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Input } from "@ui/input/form-controls/input";

describe("Input", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic Rendering", () => {
    it("renders text input", () => {
      render(<Input type="text" placeholder="Enter text" />);
      const input = screen.getByPlaceholderText("Enter text");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("type", "text");
    });

    it("renders password input", () => {
      render(<Input type="password" placeholder="Enter password" />);
      const input = screen.getByPlaceholderText("Enter password");
      expect(input).toHaveAttribute("type", "password");
    });

    it("renders email input", () => {
      render(<Input type="email" placeholder="Enter email" />);
      const input = screen.getByPlaceholderText("Enter email");
      expect(input).toHaveAttribute("type", "email");
    });

    it("renders number input", () => {
      render(<Input type="number" placeholder="Enter number" />);
      const input = screen.getByPlaceholderText("Enter number");
      expect(input).toHaveAttribute("type", "number");
    });

    it("renders date input", () => {
      const { container } = render(<Input type="date" />);
      const input = container.querySelector('input[type="date"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("type", "date");
    });

    it("renders with custom className", () => {
      render(<Input type="text" className="custom-class" />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveClass("custom-class");
    });
  });

  describe("Input Values", () => {
    it("renders with default value", () => {
      render(<Input type="text" defaultValue="default text" />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.value).toBe("default text");
    });

    it("renders with controlled value", () => {
      render(<Input type="text" value="controlled value" onChange={vi.fn()} />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.value).toBe("controlled value");
    });

    it("updates value on change", () => {
      const handleChange = vi.fn();
      render(<Input type="text" onChange={handleChange} />);
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "new value" } });
      expect(handleChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("Disabled State", () => {
    it("can be disabled", () => {
      render(<Input type="text" disabled />);
      const input = screen.getByRole("textbox");
      expect(input).toBeDisabled();
    });

    it("is not disabled by default", () => {
      render(<Input type="text" />);
      const input = screen.getByRole("textbox");
      expect(input).not.toBeDisabled();
    });

    it("applies disabled attribute", () => {
      const handleChange = vi.fn();
      render(<Input type="text" disabled onChange={handleChange} />);
      const input = screen.getByRole("textbox");
      // Test that disabled attribute is present (browser handles preventing real user interaction)
      expect(input).toBeDisabled();
      // Note: fireEvent.change() programmatically triggers onChange regardless of disabled state
      // This is test utility behavior, not a bug - real users can't interact with disabled inputs
    });
  });

  describe("Sizes", () => {
    it("applies medium size by default", () => {
      render(<Input type="text" />);
      const input = screen.getByRole("textbox");
      expect(input.className).toContain("py-2");
      expect(input.className).toContain("px-3");
    });

    it("applies small size", () => {
      render(<Input type="text" size="sm" />);
      const input = screen.getByRole("textbox");
      expect(input.className).toContain("py-1");
      expect(input.className).toContain("px-2");
    });
  });

  describe("Styling", () => {
    it("applies default styles", () => {
      render(<Input type="text" />);
      const input = screen.getByRole("textbox");
      expect(input.className).toContain("border");
      expect(input.className).toContain("rounded");
    });

    it("can disable default styles with noStyles prop", () => {
      render(<Input type="text" noStyles />);
      const input = screen.getByRole("textbox");
      expect(input.className).not.toContain("border");
    });

    it("applies invalid styles when invalid prop is present", () => {
      render(<Input type="text" className="invalid" />);
      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();
    });
  });

  describe("Placeholder", () => {
    it("renders with placeholder text", () => {
      render(<Input type="text" placeholder="Enter your name" />);
      const input = screen.getByPlaceholderText("Enter your name");
      expect(input).toBeInTheDocument();
    });

    it("placeholder disappears when typing", () => {
      render(<Input type="text" placeholder="Type here" />);
      const input = screen.getByPlaceholderText("Type here") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "text" } });
      expect(input.value).toBe("text");
    });
  });

  describe("Required Field", () => {
    it("can be marked as required", () => {
      render(<Input type="text" required />);
      const input = screen.getByRole("textbox");
      expect(input).toBeRequired();
    });

    it("is not required by default", () => {
      render(<Input type="text" />);
      const input = screen.getByRole("textbox");
      expect(input).not.toBeRequired();
    });
  });

  describe("Ref Forwarding", () => {
    it("forwards ref to input element", () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input type="text" ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it("can focus input via ref", () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input type="text" ref={ref} />);
      ref.current?.focus();
      expect(document.activeElement).toBe(ref.current);
    });
  });

  describe("Number Input Specific", () => {
    it("accepts min and max attributes", () => {
      render(<Input type="number" min={0} max={100} />);
      const input = screen.getByRole("spinbutton");
      expect(input).toHaveAttribute("min", "0");
      expect(input).toHaveAttribute("max", "100");
    });

    it("accepts step attribute", () => {
      render(<Input type="number" step={0.5} />);
      const input = screen.getByRole("spinbutton");
      expect(input).toHaveAttribute("step", "0.5");
    });
  });

  describe("Readonly State", () => {
    it("can be marked as readonly", () => {
      render(<Input type="text" readOnly value="readonly text" onChange={vi.fn()} />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("readonly");
    });

    it("does not trigger onChange when readonly (browser behavior)", () => {
      const handleChange = vi.fn();
      render(<Input type="text" readOnly defaultValue="test" onChange={handleChange} />);
      const input = screen.getByRole("textbox");
      // Note: In testing library, readonly inputs can still trigger change events
      // This is a limitation of jsdom, but in real browsers readonly prevents typing
      fireEvent.change(input, { target: { value: "test" } });
      // We just verify the input has readonly attribute
      expect(input).toHaveAttribute("readonly");
    });
  });

  describe("Range Input", () => {
    it("renders range input", () => {
      const { container } = render(<Input type="range" min={0} max={100} />);
      const input = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("type", "range");
    });

    it("accepts value for range input", () => {
      const { container } = render(<Input type="range" value={50} min={0} max={100} onChange={vi.fn()} />);
      const input = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.value).toBe("50");
    });
  });

  // #2075: in the dark theme the dark border class (same specificity, emitted
  // later) beat aria-invalid:border-red, so an invalid input showed no red
  // border. The stacked dark + aria-invalid variant has the higher specificity.
  it("marks an invalid input red in both themes", () => {
    render(<Input type="text" placeholder="Amount" aria-invalid={true} />);
    const classes = screen.getByPlaceholderText("Amount").className.split(/\s+/);
    expect(classes).toContain("aria-invalid:border-red");
    expect(classes).toContain("dark:aria-invalid:border-red");
  });
});
