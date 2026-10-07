import {ProfileError} from "./errors.js";
import {instagramStep} from "./instagram.js";
export class Paused extends Error { constructor() { super("Paused by you."); } }
export class Runner {
  constructor({api, onStatus, wait = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
    this.api = api; this.onStatus = onStatus; this.wait = wait; this.stopped = false; this.tabId = null;
  }
  pause() { this.stopped = true; }
  check() { if (this.stopped) throw new Paused(); }
  async delay(ms) {
    for (let remaining = ms; remaining > 0; remaining -= 250) {
      this.check(); await this.wait(Math.min(remaining, 250));
    }
    this.check();
  }
  async step(operation, account, username) {
    this.stage = operation;
    this.check();
    try {
      const result = await this.api.scripting.executeScript({target: {tabId: this.tabId}, func: instagramStep, args: [{operation, account, username}]});
      this.check();
      if (result[0]?.error) throw new Error(result[0].error.message || "Instagram action failed.");
      const reply = result[0]?.result;
      if (reply?.error) {
        if (reply.scope === "profile") throw new ProfileError(reply.error, {stage: operation, uncertain: operation === "verify"});
        throw new Error(reply.error);
      }
      if (!reply) throw new Error("Instagram did not return a result. Check the tab before resuming.");
      return reply;
    } catch (error) {
      error.stage ||= operation;
      throw error;
    }
  }
  async navigate(username, account) {
    this.stage = "navigate";
    this.check();
    await this.api.tabs.update(this.tabId, {url: `https://www.instagram.com/${username}/`, active: false});
    // tabs.update can briefly return the previous page's complete status.
    await this.delay(800);
    for (let i = 0; i < 80; i++) {
      this.check();
      const tab = await this.api.tabs.get(this.tabId);
      if (tab.status === "complete" && tab.url?.replace(/\/$/, "").toLowerCase() === `https://www.instagram.com/${username}`) {
        await this.delay(1800); return;
      }
      if (tab.url && /instagram\.com\/(accounts\/login|challenge|checkpoint)/.test(tab.url)) throw new Error("Instagram requires login or verification. Stopped.");
      await this.delay(500);
    }
    const lastTab = await this.api.tabs.get(this.tabId);
    if (lastTab.url?.replace(/\/$/, "").toLowerCase() !== `https://www.instagram.com/${username}`) {
      throw new Error("Instagram left the expected profile while loading. Stopped.");
    }
    // Recheck account/restrictions before classifying a slow profile as skippable.
    await this.step("identify", account, username);
    throw new ProfileError("Profile did not finish loading. Flagged for review.", {stage: "navigate"});
  }
  async block(username, account) {
    await this.navigate(username, account);
    this.onStatus(`Checking @${username}`);
    if ((await this.step("inspect", account, username)).alreadyBlocked) return "already-blocked";
    if ((await this.step("open-menu", account, username)).alreadyBlocked) return "already-blocked";
    await this.delay(900);
    let menuReady = false, menuDetail = "";
    for (let attempt = 0; attempt < 16; attempt++) {
      const menu = await this.step("choose-block", account, username);
      if (menu.alreadyBlocked) return "already-blocked";
      if (menu.clicked) { menuReady = true; break; }
      if (!menu.waiting) throw new Error("Unexpected result while reading the Block menu. Stopped.");
      menuDetail = menu.detail || "";
      await this.delay(500);
    }
    if (!menuReady) throw new ProfileError(`Profile options opened, but the Block control could not be located. ${menuDetail} No Block click was sent.`, {stage: "choose-block"});
    await this.delay(900);
    await this.step("confirm-block", account, username);
    for (let attempt = 0; attempt < 15; attempt++) {
      await this.delay(600);
      if ((await this.step("verify", account, username)).blocked) return "blocked";
    }
    throw new ProfileError("Block was submitted but could not be verified. Check this profile manually before retrying.", {stage: "verify", uncertain: true});
  }
}
