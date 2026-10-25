import { useEffect, useState } from 'react';

export interface ActivityState {
  activeCount: number;
  latestLabel: string;
}

type Listener = (state: ActivityState) => void;

let activeTasks = new Map<number, string>();
let nextTaskId = 1;
const listeners = new Set<Listener>();

function getSnapshot(): ActivityState {
  const values = Array.from(activeTasks.values());
  return {
    activeCount: activeTasks.size,
    latestLabel: values.length > 0 ? values[values.length - 1] : '',
  };
}

function emit() {
  const snapshot = getSnapshot();
  listeners.forEach((fn) => fn(snapshot));
}

/**
 * Starts tracking a global async operation (API stream, model fetch, IndexedDB transaction, route switch).
 * Returns a cleanup function that MUST be called in `finally`.
 */
export function beginGlobalActivity(label: string = '正在同步数据...'): () => void {
  const id = nextTaskId++;
  activeTasks.set(id, label);
  emit();

  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    activeTasks.delete(id);
    emit();
  };
}

export function useGlobalActivity(): ActivityState {
  const [state, setState] = useState<ActivityState>(() => getSnapshot());

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return state;
}
