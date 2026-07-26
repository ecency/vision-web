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
});
