# Add-on Options: GitLab Ticket Creator

This page outlines the configuration options for the Thunderbird add-on **GitLab Ticket Creator**. These settings are required for the add-on to communicate properly with your GitLab instance. Some options are also aimed at improving the user experience.

---

## GitLab URL

**Field:** `GitLab URL`
**Type:** Text field
**Example:** `https://gitlab.visionconnect.de`

Enter the URL of your GitLab instance here. It must be valid and publicly reachable, otherwise the connection will fail.

**Note:**
If you forget to include the protocol (`https://`), it will be added automatically. Invalid inputs are caught and will trigger a warning.

---

## GitLab Access Token

**Field:** `GitLab Token`
**Type:** Password field (toggle visibility)

The add-on requires a personal access token to create issues on your behalf. This token is **stored locally** and **never shared with third parties**.

**Required Permissions:**
The token must at minimum have the following scope:

* `api` – for creating issues

**Generate Token:**
Once a valid GitLab URL is entered but no token is present, a “Generate Access Token” button will appear. It links directly to the correct page on your GitLab instance.

---

## Assignee Auto-complete

**Option:** `Automatically load assignees`
**Type:** Checkbox

When enabled, the add-on will automatically load a list of assignable users from the selected GitLab project. This is optional, but helpful if you want to assign issues to a specific person right away.

**Note:**
In large groups, this may cause longer loading times.

---

## Cleanup / Clear Cache

These buttons are mostly relevant for developers or debugging. They clear locally stored data without affecting anything on GitLab itself.

### “Clear Cache”

Clears all cached data stored by the add-on, including project lists, assignee data, and stored metadata. Use this if projects have changed or things aren’t updating properly.

### “Reset Projects”

Clears only the cached GitLab project list. Handy if new projects were added but don’t show up yet.

### “Reset Assignees”

Clears the locally stored list of assignable users. It will be reloaded the next time the interface is opened (if auto-load is enabled).

---

## Storage Location

All settings are stored locally within Thunderbird (`browser.storage.local`). There is no automatic synchronization between devices.

---

## Error Handling

Error messages are displayed directly in the add-on window using `alert()`. If there are issues connecting to GitLab or problems with configuration, the messages will explain what’s missing or misconfigured.

---

## Summary

| Setting                    | Description                                     |
| -------------------------- | ----------------------------------------------- |
| **GitLab URL**             | URL to your GitLab instance                     |
| **GitLab Token**           | Personal access token with API scope            |
| **Assignee Auto-complete** | Enables automatic loading of assignable users   |
| **Clear Cache**            | Removes all cached metadata                     |
| **Reset Projects**         | Clears only the cached project list             |
| **Reset Assignees**        | Clears only the cached list of assignable users |
