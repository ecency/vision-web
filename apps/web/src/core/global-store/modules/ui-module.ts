export function createUiState() {
  return {
    login: false,
    uiNotifications: false
  };
}

type State = ReturnType<typeof createUiState>;

export function createUiActions(set: (state: Partial<State>) => void, getState: () => State) {
  // Write only on a real change. zustand's set() always builds a new state object
  // and notifies EVERY subscriber, so a write of the value the store already holds
  // is pure fan-out: ~130 useGlobalStore call sites re-run their selectors, and any
  // subscriber whose commit writes back to the store closes a loop that React ends
  // with "Maximum update depth exceeded" (ECENCY-NEXT-1GJW, issue #1432). Redundant
  // writes are routine here — the modal's onHide re-asserts the flag the closing
  // click already cleared — so this is the cheapest place to break that class.
  const setIfChanged = <K extends keyof State>(key: K, value: State[K]) => {
    if (getState()[key] !== value) {
      set({ [key]: value } as Partial<State>);
    }
  };

  return {
    setLogin: (value: boolean) => {
      setIfChanged("login", value);
    },
    toggleUiProp: (type: "login" | "notifications", value?: boolean) => {
      if (type === "login") {
        setIfChanged("login", value ?? !getState().login);
      } else if (type === "notifications") {
        setIfChanged("uiNotifications", value ?? !getState().uiNotifications);
      }
    }
  };
}
