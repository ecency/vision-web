// Safari <= 15 does not make SpeechSynthesis an EventTarget, so
// `addEventListener` is undefined there. Calling it threw inside the Promise
// executor below, which REJECTED the promise, and neither caller attaches a
// `.catch` -- so the failure surfaced as an unhandled rejection and text-to-speech
// silently lost its voice list.
//
// The fallback polls instead of assigning `onvoiceschanged`. That property holds
// exactly ONE handler, and both callers (`useTts` and the settings dialog) can be
// waiting at the same time, so the second assignment would strand the first
// caller's promise forever. Polling gives every caller an independent waiter and
// always settles, on a browser where we cannot rely on the event firing at all.
const FALLBACK_POLL_INTERVAL_MS = 250;
const FALLBACK_TIMEOUT_MS = 5000;

export function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
        const readVoices = () =>
            window.speechSynthesis.getVoices().filter(Boolean) as SpeechSynthesisVoice[];

        const voices = readVoices();
        if (voices.length) {
            resolve(voices);
            return;
        }

        if (typeof window.speechSynthesis.addEventListener === "function") {
            const handler = () => {
                resolve(readVoices());
                window.speechSynthesis.removeEventListener("voiceschanged", handler);
            };
            window.speechSynthesis.addEventListener("voiceschanged", handler);
            return;
        }

        const startedAt = Date.now();
        const poll = window.setInterval(() => {
            const polledVoices = readVoices();
            // Resolve with whatever is there once the budget runs out: an empty
            // list is a state both callers already handle, and leaving the promise
            // pending forever would hang them instead.
            if (polledVoices.length || Date.now() - startedAt >= FALLBACK_TIMEOUT_MS) {
                window.clearInterval(poll);
                resolve(polledVoices);
            }
        }, FALLBACK_POLL_INTERVAL_MS);
    });
}
export function createUtterance(text: string): SpeechSynthesisUtterance | null {
    if (typeof window === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return null;
    return new SpeechSynthesisUtterance(text.replace(/^[^\w]+?/g, "").trim());
}
