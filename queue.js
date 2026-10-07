import {canSkipProfile} from './errors.js';
import {Runner, Paused} from './runner.js';
import {normalizeUsername, nextRow} from './core.js';
export const ALARM = 'fresh-start-queue';
export const activeRun = state => ['running', 'pausing'].includes(state.run?.phase);
const completionMessage = state => {
  const review = state.rows.filter(row => row.status === 'failed').length;
  return review ? `Finished the queue. ${review} profile${review === 1 ? '' : 's'} need review; use the Needs review filter.` : 'Finished. All selected pending profiles have been processed.';
};
const initial = () => ({rows: [], owners: [], account: '', interval: 30, revision: 0});

// Only this worker writes queue state. Short transactions serialize Start/Pause,
// edits and alarm events; no storage lock is held while Instagram is loading.
export class Queue {
  constructor(api, {now = () => Date.now(), makeRunner = options => new Runner(options)} = {}) {
    this.api = api; this.now = now; this.makeRunner = makeRunner;
    this.transactions = Promise.resolve(); this.busy = false; this.runner = null;
  }
  transaction(fn) {
    const task = this.transactions.then(async () => {
      const state = {...initial(), ...(await this.api.storage.local.get('freshStart')).freshStart};
      return fn(state);
    });
    this.transactions = task.catch(() => {}); return task;
  }
  async write(state) {
    state.revision = (state.revision || 0) + 1;
    await this.api.storage.local.set({freshStart: state}); return state;
  }
  async arm(state) {
    await this.api.alarms.create(ALARM, {when: Math.max(this.now() + 30000, state.run.nextAt), periodInMinutes: 0.5});
  }
  async snapshot() {
    return this.transaction(async state => {
      if (!this.busy && state.run?.phase === 'pausing') {
        for (const row of state.rows) if (row.status === 'blocking') {
          row.status = 'failed'; row.detail = 'Interrupted during pause. Check Instagram before retrying.';
        }
        state.run.phase = 'paused'; state.run.message = 'Paused. Interrupted profiles need review.';
        await this.api.alarms.clear(ALARM); await this.write(state);
      } else if (!this.busy && state.run?.phase === 'running') {
        // Alarms may be lost across browser lifecycle events. Re-arm when reopened.
        if (!await this.api.alarms.get(ALARM)) await this.arm(state);
      }
      return state;
    });
  }
  async edit(input, revision) {
    return this.transaction(async state => {
      if (activeRun(state) || this.busy) throw new Error('Pause the background run before changing the queue.');
      if ((state.revision || 0) !== revision) throw new Error('Progress changed in another context. Reopen the dashboard before editing.');
      // The dashboard may edit review data, but cannot supply a running job.
      for (const key of ['rows', 'owners', 'account', 'interval']) state[key] = input[key];
      delete state.run;
      return this.write(state);
    });
  }
  async start({account, tabId, interval, confirmed, revision}) {
    return this.transaction(async state => {
      if (activeRun(state) || this.busy) throw new Error('A run is already in progress.');
      if ((state.revision || 0) !== revision) throw new Error('Progress changed. Reopen the dashboard and review it again.');
      if (!confirmed) throw new Error('Review and confirm your selected accounts first.');
      if (!normalizeUsername(account) || normalizeUsername(account) !== account || !Number.isInteger(tabId)) throw new Error('Verify the destination account first.');
      if (!Number.isInteger(interval) || interval < 10 || interval > 600) throw new Error('Choose a delay from 10 to 600 seconds.');
      if (state.owners.includes(account)) throw new Error('Use your new account, not the account that generated the export.');
      if (state.account && state.account !== account && state.rows.some(row => row.status !== 'pending')) throw new Error('This progress belongs to another account.');
      if (!nextRow(state.rows)) throw new Error('No selected pending accounts.');
      if (state.rows.some(row => row.selected && row.status === 'pending' && (!normalizeUsername(row.username) || row.username === account))) throw new Error('Exclude the destination account and any invalid username from the list.');
      state.account = account; state.interval = interval;
      state.run = {id: `${this.now()}-${Math.random()}`, phase: 'running', account, tabId, nextAt: this.now(), message: 'Starting in the background. Checking the first profile…'};
      // Arm before saving so a worker exit cannot leave a saved run without a wakeup.
      await this.arm(state); return this.write(state);
    });
  }
  async pause(message = 'Paused. Verify your account when you want to resume.') {
    this.runner?.pause();
    return this.transaction(async state => {
      if (!activeRun(state)) return state;
      this.runner?.pause();
      await this.api.alarms.clear(ALARM);
      state.run.phase = this.busy ? 'pausing' : 'paused';
      state.run.message = this.busy ? 'Pausing. A click already sent may finish.' : message;
      return this.write(state);
    });
  }
  async recoverAfterRestart() {
    this.runner?.pause();
    return this.transaction(async state => {
      await this.api.alarms.clear(ALARM);
      let interrupted = false;
      for (const row of state.rows) if (row.status === 'blocking') {
        interrupted = true; row.status = 'failed'; row.detail = 'Interrupted. Check Instagram before retrying this profile.';
      }
      if (activeRun(state) || interrupted) {
        state.run = {...state.run, phase: 'paused', message: 'Browser or extension restarted. Progress saved; verify your account to resume.'};
        await this.write(state);
      }
      return state;
    });
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    let job;
    try {
      job = await this.transaction(async state => {
        if (state.run?.phase !== 'running' || this.now() < state.run.nextAt) return null;
        const interrupted = state.rows.find(row => row.status === 'blocking');
        if (interrupted) {
          interrupted.status = 'failed'; interrupted.detail = 'Background worker was interrupted. Check this profile before retrying.';
          state.run.phase = 'paused'; state.run.message = interrupted.detail;
          await this.api.alarms.clear(ALARM); await this.write(state); return null;
        }
        const row = nextRow(state.rows);
        if (!row) {
          state.run.phase = 'finished'; state.run.message = completionMessage(state);
          await this.api.alarms.clear(ALARM); await this.write(state); return null;
        }
        this.runner = this.makeRunner({api: this.api, onStatus: () => {}}); this.runner.tabId = state.run.tabId;
        row.status = 'blocking'; row.detail = ''; delete row.failure;
        state.run.message = `Processing @${row.username} in the background…`;
        await this.write(state);
        return {id: state.run.id, username: row.username, account: state.run.account};
      });
      if (!job) return;
      let outcome, error;
      try { outcome = await this.runner.block(job.username, job.account); }
      catch (caught) { error = caught; }
      await this.transaction(async state => {
        if (state.run?.id !== job.id) return;
        const row = state.rows.find(row => row.username === job.username);
        if (!row) throw new Error('Current profile is missing from saved progress.');
        row.status = error ? 'failed' : outcome;
        row.failure = error ? {
          stage: error.stage || this.runner?.stage || 'unknown',
          scope: canSkipProfile(error) ? 'profile' : 'run',
          uncertain: !!error.uncertain
        } : null;
        row.detail = error ? (error instanceof Paused ? 'Paused mid-profile. Check Instagram before retrying.' : `[${row.failure.stage}] ${error.message}`) : '';
        row.updatedAt = new Date(this.now()).toISOString();
        if ((error && !canSkipProfile(error)) || state.run.phase === 'pausing') {
          state.run.phase = 'paused'; state.run.message = error ? row.detail : 'Paused. Completed action saved.';
          await this.api.alarms.clear(ALARM);
        } else if (!nextRow(state.rows)) {
          state.run.phase = 'finished'; state.run.message = completionMessage(state);
          await this.api.alarms.clear(ALARM);
        } else {
          state.run.nextAt = this.now() + state.interval * 1000;
          state.run.message = `@${row.username}: ${error ? 'flagged for review; continuing' : outcome.replaceAll('-', ' ')}. Next profile after ${new Date(state.run.nextAt).toLocaleTimeString()}. You can leave this dashboard.`;
          await this.arm(state);
        }
        await this.write(state);
      });
    } catch (error) {
      // Stop on persistence/API failures; never let a watchdog retry an uncertain click.
      await this.transaction(async state => {
        if (!activeRun(state)) return;
        state.run.phase = 'paused'; state.run.message = `Background run stopped: ${error.message}`;
        for (const row of state.rows) if (row.status === 'blocking') { row.status = 'failed'; row.detail = 'Outcome uncertain. Check Instagram before retrying.'; }
        await this.api.alarms.clear(ALARM); await this.write(state);
      });
    } finally {
      this.runner = null;
      // A pause may arrive just before a scheduled tick decides there is no job.
      await this.transaction(async state => {
        if (state.run?.phase === 'pausing') {
          state.run.phase = 'paused'; state.run.message = 'Paused. Verify your account to resume.';
          await this.write(state);
        }
      }).finally(() => { this.busy = false; });
    }
  }
}
