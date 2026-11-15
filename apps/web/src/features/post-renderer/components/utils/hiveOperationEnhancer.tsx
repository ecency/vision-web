import { createRoot, Root } from "react-dom/client";
import { HiveOperationRenderer } from "../extensions";
import { swapIn } from "./dom-swap";

export function applyHiveOperations(
    container: HTMLElement,
    onClick?: (op: string) => void,
    undos: (() => void)[] = []
): Root[] {
    const roots: Root[] = [];

    Array.from(
        container.querySelectorAll<HTMLElement>(
            ".markdown-view:not(.markdown-view-pure) .markdown-external-link"
        )
    )
        .filter((el) => el.innerText.startsWith("hive://sign/op/"))
        .forEach((el) => {
            try {
                if (el.dataset.enhanced === "true") return;

                // Verify element is still connected to the DOM
                if (!el.isConnected || !el.parentElement) {
                    console.warn("Hive operation element is not connected to DOM, skipping");
                    return;
                }

                el.dataset.enhanced = "true";

                const op = el.innerText.replace("hive://sign/op/", "");

                const wrapper = document.createElement("div");
                wrapper.classList.add("er-hive-op");
                wrapper.addEventListener("click", () => onClick?.(op));

                const root = createRoot(wrapper);
                root.render(<HiveOperationRenderer op={op} />);
                roots.push(root);

                // Final safety check before replacing
                if (el.isConnected && el.parentElement) {
                    undos.push(swapIn(el, wrapper));
                }
            } catch (error) {
                console.warn("Error enhancing Hive operation element:", error);
            }
        });

    return roots;
}
