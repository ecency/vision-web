export function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
        const voices = window.speechSynthesis.getVoices().filter(Boolean) as SpeechSynthesisVoice[];
        if (voices.length) {
            resolve(voices);
        } else {
            const handler = () => {
                resolve(window.speechSynthesis.getVoices().filter(Boolean) as SpeechSynthesisVoice[]);
                if (typeof window.speechSynthesis.removeEventListener === "function") {
                    window.speechSynthesis.removeEventListener("voiceschanged", handler);
                } else {
                    window.speechSynthesis.onvoiceschanged = null;
                }
            };
            if (typeof window.speechSynthesis.addEventListener === "function") {
                window.speechSynthesis.addEventListener("voiceschanged", handler);
            } else {
                window.speechSynthesis.onvoiceschanged = handler;
            }
        }
    });
}
export function createUtterance(text: string): SpeechSynthesisUtterance | null {
    if (typeof window === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return null;
    return new SpeechSynthesisUtterance(text.replace(/^[^\w]+?/g, "").trim());
}
