export interface HistoryOptions<T> {
  limit?: number;
  clone?: (value: T) => T;
}

export const HISTORY_LIMIT = 100;

export class History<T> {
  private states: T[] = [];
  private index = -1;
  private readonly limit: number;
  private readonly clone: (value: T) => T;

  constructor(options?: HistoryOptions<T>) {
    this.limit = options?.limit ?? HISTORY_LIMIT;
    this.clone = options?.clone ?? ((value: T) => structuredClone(value));
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.states.length - 1;
  }

  push(state: T): void {
    this.states.splice(this.index + 1);
    this.states.push(this.clone(state));
    if (this.states.length > this.limit) {
      this.states.shift();
    }
    this.index = this.states.length - 1;
  }

  undo(): T | null {
    if (!this.canUndo) return null;
    this.index -= 1;
    return this.clone(this.states[this.index]);
  }

  redo(): T | null {
    if (!this.canRedo) return null;
    this.index += 1;
    return this.clone(this.states[this.index]);
  }

  current(): T | null {
    if (this.index < 0) return null;
    return this.clone(this.states[this.index]);
  }

  clear(): void {
    this.states = [];
    this.index = -1;
  }
}
