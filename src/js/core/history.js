// Snapshot undo/redo. Pure: read()/write() are injected so it works with any view.
export function createHistory({ read, write, limit = 100, onChange = () => {} }) {
  let past = [];
  let future = [];
  let last = read();
  const notify = () => onChange({ canUndo: past.length > 0, canRedo: future.length > 0 });
  return {
    /** Call after the view changed. Returns true if a new snapshot was recorded. */
    record() {
      const now = read();
      if (now === last) return false;
      past.push(last);
      if (past.length > limit) past.shift();
      future = [];
      last = now;
      notify();
      return true;
    },
    undo() {
      return step(past, future);
    },
    redo() {
      return step(future, past);
    },
    reset() {
      past = [];
      future = [];
      last = read();
      notify();
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
  };
  function step(from, to) {
    if (!from.length) return false;
    to.push(read());
    write(from.pop());
    last = read();
    notify();
    return true;
  }
}
