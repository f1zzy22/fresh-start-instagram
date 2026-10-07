# Fresh Start for Instagram

A small, local-first Chrome extension for people who want to start a new Instagram account with a cleaner audience.

Fresh Start imports Instagram's HTML export files, lets you review/select accounts, verifies the Instagram account you are currently signed into, and then works through the selected block list with a configurable delay.

## Why this exists

People often say "just block everyone you know and start posting." That sounds easy until the list is hundreds or thousands of accounts long. Fresh Start handles the repetitive browser work while keeping the list visible and reviewable.

## Important notes

- **Not affiliated with Instagram or Meta.**
- **Use at your own risk.** Instagram can change its interface or restrict automated activity at any time.
- There is **no guaranteed safe blocking rate**. The extension defaults to 30 seconds between profiles and allows 10–600 seconds.
- The extension is designed to stop or flag uncertain states rather than blindly retry clicks.
- Blocking people does **not** guarantee they cannot discover a public account through search, recommendations, mutuals, shares, or another account.
- The current parser/automation expects Instagram's **English desktop interface**.

## Privacy

Fresh Start is local-first:

- No server or backend.
- No analytics or telemetry.
- No passwords are collected or stored.
- Imported Instagram HTML files are parsed locally in the browser.
- Usernames, selections, the destination username, and progress are stored in Chrome local extension storage on your device.
- "Export progress" creates a local JSON file containing the destination username and queue rows. Treat that file as private account data.

See [PRIVACY.md](PRIVACY.md) for the full disclosure.

## Install (developer mode)

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder.
6. Click the Fresh Start extension icon to open the dashboard.

Fresh Start currently targets Chrome 120+.

## Get your Instagram HTML export

Instagram periodically changes the wording/location of its export flow. You need an Instagram export that contains your **followers and/or following in HTML format**.

When requesting your information from Instagram/Accounts Center:

1. Request your Instagram information.
2. Include followers/following (connections).
3. Choose **HTML** rather than JSON.
4. Download and unzip the export.
5. In Fresh Start, import the relevant followers/following `.html` files.

Do not upload your export to a website for this extension. Fresh Start reads the files directly from your computer.

## Use

1. Import one or more Instagram followers/following HTML files.
2. Review the detected usernames and deselect anyone you do not want included.
3. Enter the username of the **new/destination account**.
4. Open Instagram in Chrome and sign into that destination account.
5. Click **Open Instagram & verify account**.
6. Choose the delay between profiles.
7. Review the queue and check the confirmation box.
8. Start the run.
9. Leave Chrome and the Instagram tab open. You can close/switch away from the dashboard.
10. Review any profiles marked **Needs review** before retrying them.

The extension refuses to use an imported source-account username as the destination account and verifies the signed-in account before acting.

## Safety behavior

Fresh Start intentionally fails closed in several situations:

- Login/challenge/checkpoint pages stop the run.
- Instagram restriction/error notices stop the run.
- Account mismatch stops the run.
- Ambiguous or changed profile UI is flagged or stopped instead of clicking a guessed control.
- Interrupted/uncertain actions are marked for review rather than automatically retried.
- The extension checks for a target-specific confirmation dialog before confirming a block.

This does not make automation risk-free; it is meant to reduce accidental actions when the UI changes or Chrome interrupts a run.

## Permissions

The extension requests only the permissions needed for its current design:

- `storage` — save queue/progress locally.
- `scripting` — run the small Instagram page interaction routine.
- `alarms` — resume scheduled queue work in a Manifest V3 service worker.
- `https://www.instagram.com/*` — interact only with Instagram pages.

## Repository structure

- `dashboard.html` / `dashboard.js` / `style.css` — local dashboard UI.
- `core.js` — username validation and HTML-export parsing.
- `verification.js` — verifies the signed-in destination account.
- `runner.js` — navigates profiles and performs one reviewed block flow.
- `instagram.js` — page-side Instagram UI checks/clicks.
- `queue.js` — persisted queue state, progress, pause/recovery behavior.
- `scheduler.js` — short-delay scheduling.
- `background.js` — Manifest V3 service worker/message routing.
- `errors.js` — explicit skippable profile-error type.

## Known limitations

- Instagram UI changes can break selectors/wording.
- English desktop Instagram only.
- The extension uses visible web UI rather than a private API.
- A public account can still be discovered after blocking a list.
- Very large queues can take a long time by design because actions are spaced out.

## Contributing

Issues and pull requests are welcome. If Instagram changes its UI, include:

- Chrome version
- Fresh Start version
- the stage/error shown in the dashboard
- whether the target profile was public/private/unavailable

Do **not** post private export files, passwords, session cookies, or personal account lists in issues.

## License

MIT. See [LICENSE](LICENSE).
