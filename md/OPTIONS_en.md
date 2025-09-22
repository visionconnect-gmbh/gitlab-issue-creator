# Add-on Options: GitLab Ticket Creator

**GERMAN VERSION:** [OPTIONS](./OPTIONS.md)

This page describes the configuration options of the Thunderbird add-on **GitLab Ticket Creator**. These settings are required for the add-on to communicate correctly with your GitLab instance. Some options also help optimize the user experience.

---

## GitLab URL

**Field:** `GitLab URL`
**Type:** Text field
**Example:** `https://gitlab.visionconnect.de`

Enter the URL of your GitLab instance here. It must be valid and publicly accessible; otherwise, the connection will fail.

**Note:**
If you forget the protocol (`https://`), it will be added automatically. Invalid inputs are caught and result in a notification.

---

## GitLab Access Token

**Field:** `GitLab Token`
**Type:** Password field (toggleable visibility)

The add-on requires a personal access token to create issues on your behalf. This token is **stored locally** and **not shared with third parties**.

**Required permissions:**
The token must have at least the following scope:

* `api` – for creating issues

**Creating a token:**
The “Create Access Token” button appears automatically once a valid GitLab URL is entered but no token has been set. It links directly to the relevant GitLab page.

---

## Load Assignees

**Option:** `Load assignees automatically`
**Type:** Checkbox

If enabled, the add-on automatically loads the list of possible assignees from the selected GitLab project. This feature is optional but useful if you want to assign issues to a responsible developer directly.

**Note:**
This may result in longer loading times for very large groups.

---

## Add Watermark

**Option:** `Enable watermark`
**Type:** Checkbox

When enabled, an invisible watermark is added to the ticket upon creation.
This allows easy filtering of issues created via this add-on.

---

## Disable Cache

**Option:** `Disable cache`
**Type:** Checkbox

If enabled, data will not be stored in the cache but always loaded fresh.
This should only be activated if problems occur, as it significantly affects the add-on.

**Note:**
This may cause longer load times.

---

## Cleanup / Clear Cache

These buttons are mainly relevant for developers or debugging. They delete locally stored data without affecting GitLab itself.

### “Clear cache”

Clears all cached data of the add-on, including project lists, assignee data, and saved metadata. Useful, for example, if projects have changed.

### “Reset projects”

Clears only the GitLab project list cache. Useful if new projects were added that do not appear.

### “Reset assignees”

Clears the locally stored list of possible assignees. It will be reloaded next time (if the feature is enabled).

---

## Storage Location of Settings

All settings are stored locally in Thunderbird (`browser.storage.local`). Synchronization across devices is not automatic.

---

## Error Handling

Error messages are displayed directly in the add-on window via `alert()`. For issues with GitLab connectivity or misconfiguration, clear feedback is provided so you can identify what is missing or incorrect.

---

## Summary

| Setting                   | Description                                |
| ------------------------- | ------------------------------------------ |
| **GitLab URL**            | URL of your GitLab instance                |
| **GitLab Token**          | Personal access token with API permissions |
| **Assignee Autocomplete** | Enables automatic loading of assignees     |
| **Enable watermark**      | Adds an invisible watermark to the ticket  |
| **Disable cache**         | Prevents storing data in the cache         |
| **Clear cache**           | Deletes all stored metadata                |
| **Reset projects**        | Deletes only the project list              |
| **Reset assignees**       | Deletes only the list of assignees         |
