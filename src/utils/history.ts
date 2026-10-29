/** 通用快照式历史栈：不支持事务合并，调用方决定何时 push */
export class HistoryStack<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T;
  private limit: number;

  constructor(initial: T, limit = 60) {
    this.current = initial;
    this.limit = limit;
  }

  get value(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get size(): number {
    return this.past.length;
  }

  /** 记录一个新状态；清空重做栈 */
  push(next: T): T {
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.current = next;
    return this.current;
  }

  undo(): T {
    if (!this.canUndo) return this.current;
    const previous = this.past.pop() as T;
    this.future.push(this.current);
    this.current = previous;
    return this.current;
  }

  redo(): T {
    if (!this.canRedo) return this.current;
    const next = this.future.pop() as T;
    this.past.push(this.current);
    this.current = next;
    return this.current;
  }

  reset(next: T): void {
    this.past = [];
    this.future = [];
    this.current = next;
  }
}
