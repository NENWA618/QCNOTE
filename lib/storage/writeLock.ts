/** Thrown when the signed-in user changed while a sync was in flight. */
export class UserChangedError extends Error {
  constructor() {
    super('User changed during sync');
    this.name = 'UserChangedError';
  }
}

/**
 * The notes write queue. Every read-modify-write of the notes, and every
 * user switch, runs through run() so two saves in this tab can't interleave
 * and overwrite each other.
 */
export class WriteLock {
  /** Tail of the queue. */
  private chain: Promise<unknown> = Promise.resolve();

  /**
   * Bumped synchronously by every user switch, before the switch itself is
   * queued. A sync reads it before downloading and re-checks it inside the
   * lock, so data fetched with one user's sync config is never merged into,
   * or recorded against, another session's store — even when the same user
   * signs back in mid-download.
   */
  private generationCounter = 0;

  get generation(): number {
    return this.generationCounter;
  }

  nextGeneration(): void {
    this.generationCounter++;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.catch(() => {});
    return run;
  }

  /** run, but throws UserChangedError if the user changed since `generation`. */
  runForGeneration<T>(generation: number, task: () => Promise<T>): Promise<T> {
    return this.run(async () => {
      this.assertGeneration(generation);
      return task();
    });
  }

  assertGeneration(generation: number): void {
    if (generation !== this.generationCounter) throw new UserChangedError();
  }
}
