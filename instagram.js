// Injected into the isolated extension world. Keep this function self-contained.
// English Instagram desktop UI only. Profile-layout failures can be flagged
// for review; account, restriction and unknown failures must stop the run.
export function instagramStep(args) {
  function perform({operation, account, username}) {
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const text = el => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  const buttons = scope => [...scope.querySelectorAll('button, [role="button"], [role="menuitem"]')].filter(visible);
  const exact = (scope, label) => buttons(scope).filter(el => text(el).toLowerCase() === label.toLowerCase());
  const one = (elements, description) => {
    if (elements.length !== 1) fail(`Expected one ${description}; found ${elements.length}. Instagram's layout may have changed.`, "profile");
    return elements[0];
  };
  const fail = (message, scope = "run") => { const error = new Error(message); error.scope = scope; throw error; };
  if (location.origin !== "https://www.instagram.com") fail("Instagram tab left the expected website.");
  if (/^\/(accounts\/(login|suspended)|challenge|checkpoint)/.test(location.pathname)) fail("Instagram needs your attention. Resolve login or verification manually.");
  const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alert"]')].filter(visible);
  const noticeText = dialogs.map(text).join(" ");
  if (/try again later|we restrict|temporarily blocked|something went wrong|couldn.t (?:block|complete)|suspicious|automated behavior/i.test(noticeText)) fail("Instagram reported a restriction or error. Stopped without retrying.");
  // Read a labeled navigation link, never cookies or private APIs.
  const profileLinks = [...document.querySelectorAll('a[href]')].filter(visible).filter(a =>
    a.getAttribute("aria-label") === "Profile" || text(a) === "Profile" ||
    a.querySelector('[aria-label="Profile"]'));
  const identities = [...new Set(profileLinks.map(a => {
    try {
      const u = new URL(a.href); const parts = u.pathname.split('/').filter(Boolean);
      return u.origin === location.origin && parts.length === 1 && /^[a-zA-Z0-9._]{1,30}$/.test(parts[0]) ? parts[0].toLowerCase() : null;
    } catch { return null; }
  }).filter(Boolean))];
  if (identities.length !== 1) fail("Cannot verify the signed-in account from Instagram's Profile navigation link. Use the English desktop interface and keep the sidebar visible.");
  const actual = identities[0];
  if (account && actual !== account) fail(`Account mismatch: signed in as @${actual}, expected @${account}.`);
  if (operation === "identify") return {account: actual};
  if (actual === username) fail("Refusing to block the signed-in account.");
  if (location.pathname.replace(/\/+$/, "").toLowerCase() !== `/${username}`) fail("Profile URL changed unexpectedly. Stopped.");
  const main = document.querySelector('main, [role="main"]');
  if (!main) fail("Profile content is not ready.", "profile");
  // Require a profile heading as well as the URL to avoid interacting with unrelated UI.
  const headings = [...main.querySelectorAll('h1, h2, header [role="heading"]')].filter(visible);
  if (!headings.some(el => text(el).toLowerCase().replace(/^@/, "") === username)) fail("Could not verify the target profile heading. The profile may be unavailable or the layout may have changed.", "profile");
  // Public profiles can include post headers with their own Options/Unblock
  // controls. Match the target's profile header, never a post or open dialog.
  const profileHeaders = [...main.querySelectorAll('header')].filter(header =>
    visible(header) && !header.closest('article, [role="dialog"]') &&
    headings.some(heading => header.contains(heading) && text(heading).toLowerCase().replace(/^@/, "") === username));
  if (profileHeaders.length > 1) fail("More than one target profile header found. Stopped without clicking.", "profile");
  const profileScope = profileHeaders[0];
  const profileUnblock = () => profileScope ? exact(profileScope, "Unblock").length > 0 : false;
  if (operation === "inspect") return {alreadyBlocked: profileUnblock()};
  if (operation === "open-menu") {
    if (profileUnblock()) return {alreadyBlocked: true};
    if (dialogs.length) fail("Close existing dialogs before continuing.");
    if (!profileScope) fail("Could not isolate the target profile header. Stopped rather than using a post menu.", "profile");
    const labels = [...profileScope.querySelectorAll('[aria-label="Options"], [aria-label="More options"]')].filter(visible);
    const controls = [...new Set(labels.map(el => el.closest('button, [role="button"]')).filter(Boolean))];
    one(controls, "profile options button").click();
    return {clicked: true};
  }
  if (operation === "choose-block") {
    // The same control may be contained in nested dialog/menu elements.
    const menus = [...document.querySelectorAll('[role="dialog"], [role="menu"]')].filter(visible);
    const uniqueControls = label => {
      const matches = [...new Set(menus.flatMap(menu => exact(menu, label)))];
      return matches.filter(el => !matches.some(other => other !== el && el.contains(other)));
    };
    if (uniqueControls("Unblock").length) return {alreadyBlocked: true};
    const matches = uniqueControls("Block");
    if (!matches.length) return {waiting: true, detail: `${menus.length} visible menu/dialog containers; no exact Block control found.`};
    one(matches, "Block menu item").click();
    return {clicked: true};
  }
  if (operation === "confirm-block") {
    const matching = dialogs.filter(dialog => {
      const content = text(dialog).toLowerCase();
      // Both the target and confirmation wording must appear inside this dialog.
      const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9._])@?${escaped}([^a-z0-9._]|$)`, 'i').test(content)
        && /block/.test(content) && /won.t|won’t|unblock|notify|notification|able to/.test(content);
    });
    const dialog = one(matching, "target-specific block confirmation dialog");
    one(exact(dialog, "Block"), "confirmation Block button").click();
    return {clicked: true};
  }
  if (operation === "verify") {
    const blocked = profileUnblock() || dialogs.some(dialog => {
      const content = text(dialog).toLowerCase();
      return content.includes(username) && /you(?:'ve|’ve| have)? blocked|is blocked/.test(content);
    });
    return {blocked};
  }
  fail("Unknown operation.");
}

  try { return perform(args); }
  catch (error) { return {error: error.message || String(error), scope: error.scope || "run"}; }
}
