# Privacy

Fresh Start for Instagram is designed to operate locally in your browser.

## Data the extension handles

Depending on what you import and do, Fresh Start may handle:

- Instagram usernames parsed from HTML export files
- usernames identified as the owners of imported exports
- the destination Instagram username you enter
- selection/status/progress information for the queue
- timestamps associated with queue progress

## Where data goes

Fresh Start does not include a backend, analytics service, telemetry SDK, advertising SDK, or remote database.

Imported files are read locally. Queue data is stored in Chrome extension local storage on the device running the extension.

The extension interacts with `https://www.instagram.com/*` in order to verify the signed-in account and perform the user-requested blocking workflow through Instagram's visible web interface.

## Passwords and authentication

Fresh Start does not ask for, collect, or store Instagram passwords. You sign into Instagram directly on instagram.com.

The extension does not intentionally read or export cookies, authentication tokens, or browser session storage.

## Exported progress

If you click **Export progress**, Fresh Start creates a JSON file on your computer containing the destination username and queue rows/statuses. That file can contain personal account information. Store or share it accordingly.

## Clearing local data

Use **Clear data** in the dashboard to delete the extension's locally saved usernames and progress. This does not unblock accounts on Instagram.

You can also remove the extension from Chrome to remove its extension storage according to Chrome's normal extension-data behavior.

## Third parties

Fresh Start is independent software and is not affiliated with, endorsed by, or sponsored by Instagram or Meta.

Instagram's own collection and use of data is governed by Meta's policies, not this extension.
