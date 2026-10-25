import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clockNow, MINUTE } from "../agent/time";
import { initialState, STATE_VERSION, type AppState } from "./state";

// One store for the whole app. `update` applies changes synchronously to a ref, so the agent's
// async flows always read the latest state, then re-renders. State is saved to device storage
// (localStorage on the web) shortly after each change.

const KEY = "sous:state";

export interface Store {
  state: AppState;
  get: () => AppState;
  update: (fn: (s: AppState) => AppState) => void;
  reset: () => void;
  ready: boolean;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const ref = useRef<AppState>(initialState());
  const [state, setState] = useState<AppState>(ref.current);
  const [ready, setReady] = useState(false);

  const update = useCallback((fn: (s: AppState) => AppState) => {
    ref.current = fn(ref.current);
    setState(ref.current);
  }, []);

  const reset = useCallback(() => {
    const fresh = initialState();
    fresh.runtime = ref.current.runtime;
    ref.current = fresh;
    setState(fresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const saved = JSON.parse(raw) as AppState;
        if (saved.version !== STATE_VERSION) return;
        // A saved scenario from another day starts over at today's 16:40.
        const fresh = initialState();
        const savedDay = saved.calendar.day;
        if (savedDay !== fresh.calendar.day && clockNow(saved.clock) - fresh.clock.anchorScenario > 12 * 60 * MINUTE) return;
        ref.current = { ...saved, runtime: ref.current.runtime, session: { ...saved.session, busy: false } };
        setState(ref.current);
      })
      .catch(() => {})
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      const { runtime: _runtime, ...rest } = state;
      AsyncStorage.setItem(KEY, JSON.stringify(rest)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [state, ready]);

  const store = useMemo<Store>(() => ({ state, get: () => ref.current, update, reset, ready }), [state, update, reset, ready]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}

/** Scenario time, re-rendering every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const { state } = useStore();
  const [now, setNow] = useState(() => clockNow(state.clock));
  useEffect(() => {
    setNow(clockNow(state.clock));
    const t = setInterval(() => setNow(clockNow(state.clock)), intervalMs);
    return () => clearInterval(t);
  }, [state.clock, intervalMs]);
  return now;
}
