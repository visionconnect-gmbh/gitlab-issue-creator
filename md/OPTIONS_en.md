# Options – GitLab Issue Creator

> **Deutsche Version:** [OPTIONS.md](./OPTIONS.md)

This page covers every setting on the **Options** page (`Add-ons and Themes → GitLab Issue Creator → Options`).  
All values are stored in `browser.storage.local` on the local machine — nothing is synced automatically.

---

## Required settings

These two fields must be filled in before the add-on can do anything.

### GitLab URL

| | |
|---|---|
| **Storage key** | `gitlab_settings.url` |
| **Type** | Text field |
| **Example** | `https://gitlab.example.com` |

The base URL of your GitLab instance.  
The `https://` protocol prefix is added automatically if you omit it. Invalid or unreachable URLs are caught on save and shown as an error.

> ℹ️ Self-hosted instances work exactly the same as gitlab.com — just enter your own domain.

---

### Personal Access Token

| | |
|---|---|
| **Storage key** | `gitlab_settings.token` |
| **Type** | Password field (eye icon toggles visibility) |
| **Required scope** | `api` |

The token used to authenticate every API call.  
It is stored locally and never transmitted anywhere except your GitLab instance.

**How to create one:**  
The **"Create Access Token"** button appears automatically once a valid GitLab URL is saved but no token is present yet. It opens your GitLab's token-creation page directly.  
You can also go there manually: `<your-gitlab-url>/-/user_settings/personal_access_tokens`.

> ⚠️ The `api` scope is the only one required. Do not grant more permissions than necessary.

---

## Optional settings

These are off by default. Each setting is saved individually when you toggle it — there is no separate Save button for checkboxes.

### Load assignees automatically

| | |
|---|---|
| **Storage key** | `enable_assignee_loading` |
| **Default** | `false` (off) |

When enabled, the popup fetches the member list of the selected GitLab project so you can assign the issue to someone directly.  
This adds one extra API call per project when it is first selected. Results are cached (~9 h TTL) so subsequent opens are instant.

> ℹ️ Leave this off if you work with very large groups (hundreds of members) or don't need assignees.

---

### Watermark

| | |
|---|---|
| **Storage key** | `enable_watermark` |
| **Default** | `true` (on) |

Appends a hidden HTML comment to every issue description:

```
<!-- created with gitlab-issue-creator (vX.Y.Z) -->
```

This comment is invisible in GitLab's rendered Markdown but lets you filter issues created by this add-on (e.g. with a GitLab search or script).

---

### Disable cache

| | |
|---|---|
| **Storage key** | `disable_cache` |
| **Default** | `false` (off) |

Forces every API call to skip the local cache and always fetch fresh data.

> ⚠️ Only enable this for debugging or if you're seeing stale data. It makes every popup open noticeably slower.

---

## Cache management buttons

These buttons delete locally stored data. They do **not** affect GitLab itself.

| Button | What it deletes | When to use it |
|---|---|---|
| **Clear Cache** | All cached API responses (projects + assignees + user) | Full reset; new data will be fetched on next use |
| **Clear Projects** | Only the cached project list | A project you just created isn't showing up |
| **Clear Assignees List** | Only the cached assignee map | A new team member isn't appearing in the list |
| **Reset Add-on** | Everything including settings | Starting fresh / switching GitLab instances |

> ℹ️ After clearing, the popup will re-fetch data from GitLab the next time it opens. This may take a few extra seconds.

---

## Storage reference

All settings live in Thunderbird's `browser.storage.local`. The keys used by this add-on are:

| Key | Contents |
|---|---|
| `gitlab_settings` | `{ url, token }` object |
| `enable_assignee_loading` | boolean |
| `enable_watermark` | boolean |
| `disable_cache` | boolean |
| `cache_projects` | `{ data, timestamp }` – project list cache |
| `cache_assignees_ALL` | `{ data, timestamp }` – assignee map cache |
| `cache_current_user` | `{ data, timestamp }` – authenticated user cache |

> 📎 Key names are defined in `src/utils/Enums.js → CacheKeys`. That file is the authoritative source if you ever see a discrepancy here.

---

## Error messages reference

| Message | Cause | Fix |
|---|---|---|
| *"Please enter a valid GitLab URL"* | URL field is empty or malformed | Enter a full URL, e.g. `https://gitlab.example.com` |
| *"Please enter a valid GitLab token"* | Token field is empty | Create and paste a token with `api` scope |
| *"GitLab URL is not reachable"* | Server didn't respond | Check network / VPN |
| *"Invalid GitLab token"* | 401 from the API | Token expired, revoked, or missing `api` scope |
| *"GitLab settings are missing"* | Token or URL not configured | Open Options and fill in both fields |
