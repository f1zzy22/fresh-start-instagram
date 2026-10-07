import {Queue, ALARM} from './queue.js';
import {Scheduler} from './scheduler.js';
const queue = new Queue(chrome);
const logFailure = error => console.error('Fresh Start:', error);
const scheduler = new Scheduler(queue, {onError: logFailure});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) scheduler.wake().catch(logFailure);
});
chrome.runtime.onStartup.addListener(() => queue.recoverAfterRestart().catch(logFailure));
chrome.runtime.onInstalled.addListener(() => queue.recoverAfterRestart().catch(logFailure));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only our dashboard can control the run, never an Instagram content script.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('dashboard.html')) return false;
  const actions = {
    snapshot: () => queue.snapshot(),
    edit: () => queue.edit(message.state, message.revision),
    start: () => queue.start(message),
    pause: () => { scheduler.cancel(); return queue.pause(); }
  };
  if (!Object.hasOwn(actions, message.type)) return false;
  actions[message.type]().then(state => {
    respond({ok: true, state});
    if (message.type === 'start') scheduler.wake().catch(logFailure);
  }, error => respond({ok: false, error: error.message}));
  return true;
});
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('dashboard.html');
  const existing = (await chrome.tabs.query({})).find(tab => tab.url === url);
  if (existing) await chrome.tabs.update(existing.id, {active: true});
  else await chrome.tabs.create({url});
});
