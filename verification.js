import {Runner} from './runner.js';
export async function verifyAccount(api, account, timeoutMs = 10000) {
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const tabs = await api.tabs.query({url: 'https://www.instagram.com/*'});
        if (!tabs.length) {
          await api.tabs.create({url: 'https://www.instagram.com/'});
          throw new Error('Sign in to Instagram, then return here and verify again.');
        }
        const results = await Promise.all(tabs.map(async tab => {
          if (tab.status !== 'complete') return {error: 'An Instagram tab is still loading.'};
          try {
            const checker = new Runner({api, onStatus: () => {}}); checker.tabId = tab.id;
            const result = await checker.step('identify', account);
            return {account: result.account, tabId: tab.id, active: tab.active};
          } catch (error) { return {error: error.message}; }
        }));
        const matches = results.filter(result => result.account === account);
        if (matches.length) {
          const match = matches.find(result => result.active) || matches[0];
          return {account: match.account, tabId: match.tabId};
        }
        throw new Error([...new Set(results.map(result => result.error).filter(Boolean))].join(' ') || 'No matching signed-in account found.');
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Verification timed out. Refresh Instagram, dismiss any open dialog, and try again. If you reloaded the extension, close and reopen this dashboard.')), timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}
