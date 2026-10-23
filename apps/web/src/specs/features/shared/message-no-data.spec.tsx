import { vi } from 'vitest';
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MessageNoData } from "@/features/shared/message-no-data";

describe("MessageNoData", () => {
  const defaultProps = {
    buttonText: "Create New",
    buttonTo: "/create",
    title: "No Data Found",
    description: "There is no data to display at the moment."
  };

  test("renders title correctly", () => {
    render(<MessageNoData {...defaultProps} />);

    expect(screen.getByText("No Data Found")).toBeInTheDocument();
  });

  test("renders description correctly", () => {
    render(<MessageNoData {...defaultProps} />);

    expect(screen.getByText("There is no data to display at the moment.")).toBeInTheDocument();
  });

  test("renders button with correct text", () => {
    render(<MessageNoData {...defaultProps} />);

    expect(screen.getByText("Create New")).toBeInTheDocument();
  });

  test("renders link with correct href", () => {
    render(<MessageNoData {...defaultProps} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/create");
  });

  test("renders resting Esie when no img prop provided", () => {
    const { container } = render(<MessageNoData {...defaultProps} />);

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("data-esie-mood", "rest");
    expect(image?.getAttribute("src")).toMatch(/^\/assets\/esie\/rest\.[0-9a-f]{8}\.svg$/);
    expect(image).toHaveAttribute("aria-hidden", "true");
  });

  test("renders custom image when img prop provided", () => {
    const { container } = render(<MessageNoData {...defaultProps} img="/custom-image.png" />);

    const image = container.querySelector("img");
    // Next.js Image component transforms and URL-encodes src URLs
    const src = image?.getAttribute("src") || "";
    expect(decodeURIComponent(src)).toContain("/custom-image.png");
  });

  test("does not render button when buttonText is empty", () => {
    render(
      <MessageNoData
        buttonText=""
        buttonTo="/create"
        title="No Data"
        description="Description"
      />
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  test("does not render a secondary button by default", () => {
    render(<MessageNoData {...defaultProps} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  test("renders a secondary button when provided", () => {
    render(
      <MessageNoData
        {...defaultProps}
        secondaryButtonText="Jump into Waves"
        secondaryButtonTo="/waves"
      />
    );

    const waves = screen.getByText("Jump into Waves").closest("a");
    expect(waves).toHaveAttribute("href", "/waves");
    // Primary link is still present alongside the secondary one.
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  test("ignores a secondary button missing its destination", () => {
    render(<MessageNoData {...defaultProps} secondaryButtonText="Jump into Waves" />);

    expect(screen.queryByText("Jump into Waves")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  test("renders footer content when provided", () => {
    render(<MessageNoData {...defaultProps} footer={<span>New here? Read the guide</span>} />);

    expect(screen.getByText("New here? Read the guide")).toBeInTheDocument();
  });

  test("does not render footer by default", () => {
    render(<MessageNoData {...defaultProps} />);

    expect(screen.queryByText(/New here/)).not.toBeInTheDocument();
  });

  test("applies correct container classes", () => {
    const { container } = render(<MessageNoData {...defaultProps} />);

    const messageContainer = container.querySelector(".rounded-2xl");
    expect(messageContainer).toHaveClass(
      "rounded-2xl",
      "grid",
      "grid-cols-4",
      "gap-4",
      "max-w-[640px]",
      "mx-auto"
    );
  });

  test("renders with different button text", () => {
    render(<MessageNoData {...defaultProps} buttonText="Get Started" />);

    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  test("renders with different button destination", () => {
    render(<MessageNoData {...defaultProps} buttonTo="/different-page" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/different-page");
  });

  test("renders with long description", () => {
    const longDescription = "This is a very long description that explains in detail why there is no data available at this moment and what the user should do next.";

    render(<MessageNoData {...defaultProps} description={longDescription} />);

    expect(screen.getByText(longDescription)).toBeInTheDocument();
  });

  test("maintains correct grid structure", () => {
    const { container } = render(<MessageNoData {...defaultProps} />);

    const imageCol = container.querySelector(".col-span-1");
    const contentCol = container.querySelector(".col-span-3");

    expect(imageCol).toBeInTheDocument();
    expect(contentCol).toBeInTheDocument();
  });

  test("renders h2 tag for title", () => {
    render(<MessageNoData {...defaultProps} />);

    const title = screen.getByRole("heading", { level: 2 });
    expect(title).toHaveTextContent("No Data Found");
  });

  test("applies text styling classes to description", () => {
    const { container } = render(<MessageNoData {...defaultProps} />);

    const description = screen.getByText("There is no data to display at the moment.");
    expect(description).toHaveClass("text-gray-600", "lead");
  });

  test("renders Esie at the native empty-state height", () => {
    const { container } = render(<MessageNoData {...defaultProps} />);

    expect(container.querySelector("img")).toHaveAttribute("height", "120");
  });

  test("renders a custom image with correct dimensions", () => {
    const { container } = render(<MessageNoData {...defaultProps} img="/custom-image.png" />);

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("width", "400");
    expect(image).toHaveAttribute("height", "400");
  });
});
