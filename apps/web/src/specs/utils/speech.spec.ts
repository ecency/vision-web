import { getVoicesAsync } from "../../utils/speech";

const originalSpeechSynthesisDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "speechSynthesis"
);

const voice = {
  default: true,
  lang: "en-US",
  localService: true,
  name: "Test Voice",
  voiceURI: "test-voice"
} as SpeechSynthesisVoice;

function installSpeechSynthesis(
  responses: Array<Array<SpeechSynthesisVoice | undefined>>
) {
  let voicesChangedHandler: (() => void) | undefined;
  const getVoices = vi.fn(
    () => (responses.shift() ?? []) as SpeechSynthesisVoice[]
  );
  const addEventListener = vi.fn(
    (_event: "voiceschanged", handler: () => void) => {
      voicesChangedHandler = handler;
    }
  );
  const removeEventListener = vi.fn();

  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices,
      addEventListener,
      removeEventListener
    }
  });

  return {
    addEventListener,
    getVoices,
    removeEventListener,
    emitVoicesChanged: () => voicesChangedHandler?.()
  };
}

/**
 * Safari <= 15: `SpeechSynthesis` is not an `EventTarget` there, so the object
 * carries no `addEventListener` at all.
 */
function installSpeechSynthesisWithoutEventTarget(
  initial: Array<SpeechSynthesisVoice | undefined> = []
) {
  let current = initial;
  const getVoices = vi.fn(() => current as SpeechSynthesisVoice[]);

  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { getVoices }
  });

  return {
    getVoices,
    setVoices: (next: Array<SpeechSynthesisVoice | undefined>) => {
      current = next;
    }
  };
}

/**
 * iOS Brave wraps `getVoices()` and builds its fake voice from
 * `Object.getPrototypeOf(voices[0])`, so an empty real list makes the SHIM itself
 * throw (ECENCY-NEXT-1GMR) rather than returning a list with holes.
 */
function installSpeechSynthesisThatThrows(
  ready?: Array<SpeechSynthesisVoice | undefined>
) {
  let voicesChangedHandler: (() => void) | undefined;
  let current = ready;
  const getVoices = vi.fn(() => {
    if (!current) {
      throw new TypeError(
        "undefined is not an object (evaluating 'Object.getPrototypeOf(voice)')"
      );
    }
    return current as SpeechSynthesisVoice[];
  });

  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices,
      addEventListener: vi.fn((_event: "voiceschanged", handler: () => void) => {
        voicesChangedHandler = handler;
      }),
      removeEventListener: vi.fn()
    }
  });

  return {
    getVoices,
    setVoices: (next: Array<SpeechSynthesisVoice | undefined>) => {
      current = next;
    },
    emitVoicesChanged: () => voicesChangedHandler?.()
  };
}

afterEach(() => {
  if (originalSpeechSynthesisDescriptor) {
    Object.defineProperty(
      window,
      "speechSynthesis",
      originalSpeechSynthesisDescriptor
    );
  } else {
    Reflect.deleteProperty(window, "speechSynthesis");
  }
  vi.restoreAllMocks();
});

describe("getVoicesAsync", () => {
  it("filters undefined voices from the immediately available list", async () => {
    const speechSynthesis = installSpeechSynthesis([[undefined, voice]]);

    await expect(getVoicesAsync()).resolves.toEqual([voice]);
    expect(speechSynthesis.getVoices).toHaveBeenCalledOnce();
    expect(speechSynthesis.addEventListener).not.toHaveBeenCalled();
  });

  it("filters undefined voices from the voiceschanged list", async () => {
    const speechSynthesis = installSpeechSynthesis([
      [undefined],
      [undefined, voice]
    ]);

    const voicesPromise = getVoicesAsync();
    expect(speechSynthesis.addEventListener).toHaveBeenCalledWith(
      "voiceschanged",
      expect.any(Function)
    );

    speechSynthesis.emitVoicesChanged();

    await expect(voicesPromise).resolves.toEqual([voice]);
    const handler = speechSynthesis.addEventListener.mock.calls[0][1];
    expect(speechSynthesis.removeEventListener).toHaveBeenCalledWith(
      "voiceschanged",
      handler
    );
  });

  // Regression guard for ECENCY-NEXT-1GMR: the throw comes OUT of `getVoices()`
  // itself, so no amount of filtering downstream can catch it.
  it("waits for voiceschanged when getVoices() throws (iOS Brave)", async () => {
    const speechSynthesis = installSpeechSynthesisThatThrows();

    const voicesPromise = getVoicesAsync();
    speechSynthesis.setVoices([undefined, voice]);
    speechSynthesis.emitVoicesChanged();

    await expect(voicesPromise).resolves.toEqual([voice]);
  });

  describe("when SpeechSynthesis is not an EventTarget (Safari <= 15)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("polls for voices instead of throwing on the missing addEventListener", async () => {
      const speechSynthesis = installSpeechSynthesisWithoutEventTarget();

      const voicesPromise = getVoicesAsync();
      speechSynthesis.setVoices([undefined, voice]);
      await vi.advanceTimersByTimeAsync(250);

      await expect(voicesPromise).resolves.toEqual([voice]);
    });

    it("resolves empty once the budget runs out rather than hanging forever", async () => {
      installSpeechSynthesisWithoutEventTarget();

      const voicesPromise = getVoicesAsync();
      await vi.advanceTimersByTimeAsync(5000);

      await expect(voicesPromise).resolves.toEqual([]);
    });

    it("resolves empty rather than rejecting when getVoices() keeps throwing", async () => {
      const getVoices = vi.fn(() => {
        throw new TypeError(
          "undefined is not an object (evaluating 'Object.getPrototypeOf(voice)')"
        );
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { getVoices }
      });

      const voicesPromise = getVoicesAsync();
      await vi.advanceTimersByTimeAsync(5000);

      await expect(voicesPromise).resolves.toEqual([]);
    });

    // Regression guard: `onvoiceschanged` holds a single handler, so registering
    // through it would let a second caller overwrite the first and strand it.
    // Both callers here must be served.
    it("settles every concurrent caller, not just the most recent one", async () => {
      const speechSynthesis = installSpeechSynthesisWithoutEventTarget();

      const firstPromise = getVoicesAsync();
      const secondPromise = getVoicesAsync();
      speechSynthesis.setVoices([voice]);
      await vi.advanceTimersByTimeAsync(250);

      await expect(firstPromise).resolves.toEqual([voice]);
      await expect(secondPromise).resolves.toEqual([voice]);
    });
  });
});
