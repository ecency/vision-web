import { vi } from "vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Modal } from "@ui/modal";

describe("Modal", () => {
  let portalRoot: HTMLElement;

  beforeEach(() => {
    // Create portal container
    portalRoot = document.createElement("div");
    portalRoot.setAttribute("id", "modal-dialog-container");
    document.body.appendChild(portalRoot);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.removeChild(portalRoot);
    document.body.classList.remove("overflow-hidden");
  });

  describe("Basic Rendering", () => {
    it("renders modal when show is true", () => {
      render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Modal Content</div>
        </Modal>
      );
      expect(screen.getByText("Modal Content")).toBeInTheDocument();
    });

    it("does not render modal when show is false", () => {
      render(
        <Modal show={false} onHide={vi.fn()}>
          <div>Modal Content</div>
        </Modal>
      );
      expect(screen.queryByText("Modal Content")).not.toBeInTheDocument();
    });

    it("renders modal in portal container", () => {
      render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Portal Content</div>
        </Modal>
      );
      const portalContent = portalRoot.querySelector(".ecency-modal-content");
      expect(portalContent).toBeInTheDocument();
    });
  });

  describe("Modal Visibility", () => {
    it("calls onHide when clicking overlay", async () => {  // Fixed: Made function async
      const handleHide = vi.fn();
      render(
        <Modal show={true} onHide={handleHide}>
          <div>Content</div>
        </Modal>
      );

      // Click the container div (which has the onClick handler), not the overlay visual element
      // Use overflow-y-auto class to distinguish from the overlay div
      const container = document.querySelector(".overflow-y-auto");
      if (container) {
        fireEvent.click(container);
      }
      await waitFor(() => {  // Fixed: Added await
        expect(handleHide).toHaveBeenCalled();
      });
    });

    it("does not call onHide when clicking modal content", () => {
      const handleHide = vi.fn();
      render(
        <Modal show={true} onHide={handleHide}>
          <div>Content</div>
        </Modal>
      );

      const content = screen.getByText("Content");
      fireEvent.click(content);
      expect(handleHide).not.toHaveBeenCalled();
    });

    it("closes modal on Escape key press", async () => {
      const handleHide = vi.fn();
      render(
        <Modal show={true} onHide={handleHide}>
          <div>Content</div>
        </Modal>
      );

      fireEvent.keyUp(document, { key: "Escape" });
      await waitFor(() => {
        expect(handleHide).toHaveBeenCalled();
      });
    });

    it("does not close on other key presses", () => {
      const handleHide = vi.fn();
      render(
        <Modal show={true} onHide={handleHide}>
          <div>Content</div>
        </Modal>
      );

      fireEvent.keyUp(document, { key: "Enter" });
      expect(handleHide).not.toHaveBeenCalled();
    });
  });

  describe("Sizes", () => {
    it("applies medium size by default", () => {
      render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Content</div>
        </Modal>
      );
      const modalContent = document.querySelector(".max-w-\\[500px\\]");
      expect(modalContent).toBeInTheDocument();
    });

    it("applies small size", () => {
      render(
        <Modal show={true} onHide={vi.fn()} size="sm">
          <div>Content</div>
        </Modal>
      );
      const modalContent = document.querySelector(".sm\\:max-w-\\[375px\\]");
      expect(modalContent).toBeInTheDocument();
    });

    it("applies large size", () => {
      render(
        <Modal show={true} onHide={vi.fn()} size="lg">
          <div>Content</div>
        </Modal>
      );
      const modalContent = document.querySelector(".max-w-\\[800px\\]");
      expect(modalContent).toBeInTheDocument();
    });
  });

  describe("Centered Modal", () => {
    it("applies centered class when centered prop is true", () => {
      render(
        <Modal show={true} onHide={vi.fn()} centered>
          <div>Content</div>
        </Modal>
      );
      const modalWrapper = document.querySelector(".justify-center");
      expect(modalWrapper).toBeInTheDocument();
    });

    it("does not apply centered class by default", () => {
      render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Content</div>
        </Modal>
      );
      const modalContainer = portalRoot.querySelector('[class*="z-[1100]"]');
      expect(modalContainer?.className).not.toContain("justify-center");
    });
  });

  describe("Animation", () => {
    it("enables animation by default", () => {
      render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Content</div>
        </Modal>
      );
      const modalContent = document.querySelector(".ecency-modal-content");
      expect(modalContent).toBeInTheDocument();
    });

    it("can disable animation", () => {
      render(
        <Modal show={true} onHide={vi.fn()} animation={false}>
          <div>Content</div>
        </Modal>
      );
      const modalContent = document.querySelector(".ecency-modal-content");
      expect(modalContent).toBeInTheDocument();
    });
  });

  describe("Body Overflow", () => {
    it("adds overflow-hidden to body when modal is shown", () => {
      render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Content</div>
        </Modal>
      );
      expect(document.body.classList.contains("overflow-hidden")).toBe(true);
    });

    it("removes overflow-hidden from body when modal is hidden", () => {
      const { rerender } = render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Content</div>
        </Modal>
      );
      expect(document.body.classList.contains("overflow-hidden")).toBe(true);

      rerender(
        <Modal show={false} onHide={vi.fn()}>
          <div>Content</div>
        </Modal>
      );
      expect(document.body.classList.contains("overflow-hidden")).toBe(false);
    });

    it("keeps the page locked when one modal closes as another opens", () => {
      // The opening modal sits first in the tree, so its effect runs before the
      // closing one's cleanup; a plain remove would unlock the page under it.
      const Pair = ({ second }: { second: boolean }) => (
        <>
          <Modal show={second} onHide={vi.fn()}>
            <div>Second</div>
          </Modal>
          <Modal show={!second} onHide={vi.fn()}>
            <div>First</div>
          </Modal>
        </>
      );
      const { rerender } = render(<Pair second={false} />);
      expect(document.body.classList.contains("overflow-hidden")).toBe(true);

      rerender(<Pair second={true} />);
      expect(document.body.classList.contains("overflow-hidden")).toBe(true);

      rerender(
        <>
          <Modal show={false} onHide={vi.fn()}>
            <div>Second</div>
          </Modal>
          <Modal show={false} onHide={vi.fn()}>
            <div>First</div>
          </Modal>
        </>
      );
      expect(document.body.classList.contains("overflow-hidden")).toBe(false);
    });
  });

  describe("Custom Styling", () => {
    it("applies custom className", () => {
      render(
        <Modal show={true} onHide={vi.fn()} className="custom-modal">
          <div>Content</div>
        </Modal>
      );
      const modalContainer = portalRoot.querySelector(".custom-modal");
      expect(modalContainer).toBeInTheDocument();
    });

    it("applies custom dialogClassName", () => {
      render(
        <Modal show={true} onHide={vi.fn()} dialogClassName="custom-dialog">
          <div>Content</div>
        </Modal>
      );
      const modalDialog = portalRoot.querySelector(".custom-dialog");
      expect(modalDialog).toBeInTheDocument();
    });

    it("applies custom overlayClassName", () => {
      render(
        <Modal show={true} onHide={vi.fn()} overlayClassName="custom-overlay">
          <div>Content</div>
        </Modal>
      );
      const overlay = portalRoot.querySelector(".custom-overlay");
      expect(overlay).toBeInTheDocument();
    });
  });

  describe("Raw Mode", () => {
    it("applies raw styling when raw prop is true", () => {
      render(
        <Modal show={true} onHide={vi.fn()} raw>
          <div>Content</div>
        </Modal>
      );
      const modalContent = document.querySelector(".ecency-modal-content");
      expect(modalContent).toBeInTheDocument();
      expect(modalContent?.className).not.toContain("bg-white");
    });

    it("applies default styling when raw is false", () => {
      render(
        <Modal show={true} onHide={vi.fn()} raw={false}>
          <div>Content</div>
        </Modal>
      );
      const modalContent = document.querySelector(".bg-white");
      expect(modalContent).toBeInTheDocument();
    });
  });

  describe("Overlay", () => {
    it("renders overlay with correct styling", () => {
      render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Content</div>
        </Modal>
      );
      const overlay = document.querySelector(".bg-black");
      expect(overlay).toBeInTheDocument();
      expect(overlay?.className).toContain("z-[1100]");
    });

    it("overlay covers entire viewport", () => {
      render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Content</div>
        </Modal>
      );
      const overlay = document.querySelector(".bg-black");
      expect(overlay?.className).toContain("fixed");
      expect(overlay?.className).toContain("top-0");
      expect(overlay?.className).toContain("left-0");
      expect(overlay?.className).toContain("right-0");
      expect(overlay?.className).toContain("bottom-0");
    });
  });

  describe("Z-Index", () => {
    it("applies high z-index for modal layering", () => {
      render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Content</div>
        </Modal>
      );
      const modalContainer = portalRoot.querySelector('[class*="z-[1100]"]');
      expect(modalContainer).toBeInTheDocument();
    });
  });

  describe("Responsive Design", () => {
    it("applies responsive padding classes", () => {
      render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Content</div>
        </Modal>
      );
      const modalContainer = portalRoot.querySelector('[class*="pt-24"]');
      expect(modalContainer).toBeInTheDocument();
    });

    it("applies responsive width classes", () => {
      render(
        <Modal show={true} onHide={vi.fn()}>
          <div>Content</div>
        </Modal>
      );
      const modalContent = document.querySelector(".ecency-modal-content");
      expect(modalContent?.className).toContain("w-full");
    });
  });
});
