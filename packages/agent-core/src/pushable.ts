export interface Pushable<T> extends AsyncIterable<T> {
  push(item: T): void;
  end(): void;
}

/** An async iterable you can push into over time (streaming input for query()). */
export function createPushable<T>(): Pushable<T> {
  const queue: T[] = [];
  let wake: (() => void) | null = null;
  let ended = false;

  async function* gen(): AsyncGenerator<T> {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (ended) {
        return;
      } else {
        await new Promise<void>((resolve) => { wake = resolve; });
        wake = null;
      }
    }
  }
  const iterator = gen();
  return {
    [Symbol.asyncIterator]: () => iterator,
    push(item: T) {
      if (ended) throw new Error("push after end");
      queue.push(item);
      wake?.();
    },
    end() { ended = true; wake?.(); },
  };
}
