import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const FeatureFlagContext = createContext({
  status: "loading",
  flags: {},
  debug: {},
  isEnabled: () => false,
  lastUpdated: null
});

function buildQuery(attributes) {
  const params = new URLSearchParams();
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

export function FeatureFlagProvider({ clientId, attributes, children }) {
  const [state, setState] = useState({
    status: "loading",
    flags: {},
    debug: {},
    lastUpdated: null
  });

  const query = useMemo(() => {
    const base = { ...attributes };
    if (clientId) {
      base.clientId = clientId;
    }
    return buildQuery(base);
  }, [clientId, attributes]);

  const fetchRuleset = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "loading" }));
    const response = await fetch(`/sdk/ruleset?${query}`);
    const data = await response.json();
    setState({
      status: "ready",
      flags: data.flags || {},
      debug: data.debug || {},
      lastUpdated: data.evaluatedAt || new Date().toISOString()
    });
  }, [query]);

  useEffect(() => {
    let eventSource;
    let active = true;

    fetchRuleset().catch(() => {
      if (active) {
        setState((prev) => ({ ...prev, status: "loading" }));
      }
    });

    eventSource = new EventSource(`/sdk/stream?${query}`);
    eventSource.addEventListener("ruleset", (event) => {
      const data = JSON.parse(event.data);
      setState({
        status: "ready",
        flags: data.flags || {},
        debug: data.debug || {},
        lastUpdated: data.evaluatedAt || new Date().toISOString()
      });
    });

    eventSource.onerror = () => {
      if (active) {
        setState((prev) => ({ ...prev, status: "loading" }));
      }
    };

    return () => {
      active = false;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [fetchRuleset, query]);

  const isEnabled = useCallback(
    (key) => {
      return Boolean(state.flags[key]);
    },
    [state.flags]
  );

  const value = useMemo(
    () => ({
      ...state,
      isEnabled
    }),
    [state, isEnabled]
  );

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

export function useFeature(key) {
  const context = useContext(FeatureFlagContext);
  const enabled = context.isEnabled(key);
  const ghost = context.status !== "ready";
  return {
    enabled,
    ghost,
    reason: context.debug[key],
    lastUpdated: context.lastUpdated
  };
}

export function useFlagsMeta() {
  return useContext(FeatureFlagContext);
}
