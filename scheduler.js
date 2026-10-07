// Short delays run in the worker, never the dashboard. Persistent Chrome alarms
// remain the fallback if Chrome terminates the worker and discards this timer.
export class Scheduler {
  constructor(queue, {now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, onError = console.error} = {}) {
    this.queue = queue; this.now = now; this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.onError = onError; this.timer = null; this.generation = 0;
  }
  cancel() {
    this.generation++;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }
  async wake() {
    this.cancel();
    const generation = this.generation;
    await this.queue.tick();
    const state = await this.queue.snapshot();
    if (generation !== this.generation || state.run?.phase !== 'running') return;
    const remaining = state.run.nextAt - this.now();
    // Longer waits are handled entirely by the persistent alarm.
    if (remaining > 0 && remaining < 30000) {
      this.timer = this.setTimer(() => {
        this.timer = null;
        this.wake().catch(this.onError);
      }, remaining);
    }
  }
}
