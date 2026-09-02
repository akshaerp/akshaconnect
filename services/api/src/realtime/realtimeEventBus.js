'use strict';

function createRealtimeEventBus() {
  const listeners = new Set();

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Realtime listener must be a function');
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function publish(event) {
    if (!event || typeof event !== 'object' || !event.type) return;
    for (const listener of [...listeners]) {
      Promise.resolve()
        .then(() => listener(event))
        .catch(() => {
          // Durable work is already committed. A realtime listener failure must not
          // make the originating HTTP request look unsuccessful.
        });
    }
  }

  return Object.freeze({ subscribe, publish });
}

module.exports = { createRealtimeEventBus };
