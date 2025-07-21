# GitLab Ticket Creator | Thunderbird Add-on

This small Thunderbird add-on allows you to **create GitLab issues directly from emails**.

## What does it do?

* **Directly from the email:** Create GitLab issues while you're still viewing the email.
* **Automatic title:** The email subject becomes the ticket title automatically!
* **Full context:** The entire email thread is added to the issue description, so everything is crystal clear.
* **Quick project search:** A simple search helps you find the right GitLab project quickly.
* **Customizable:** You can edit the title and description before submitting or add any extra information you need.

## Installation

### For everyone:

**(Official announcement coming soon)**
Until then, please follow these steps:

1. Download the latest ZIP file from the repository.
2. Click the hamburger menu in the top-right corner of Thunderbird.
3. Choose “Add-ons and Themes”.
4. Click the gear icon (⚙️).
5. Select “Install Add-on From File”.
6. Choose and install the previously downloaded ZIP file.

### For developers (testing)

If you're working on the add-on or testing it:

1. Clone the repo: `git clone https://gitlab.visionconnect.de/kirchner/thunderbird-gitlab-issue.git`
2. Change into the directory: `cd thunderbird-gitlab-issue` (or whatever folder name you chose)
3. Install dependencies: `npm install`
4. Build the project: `npm run build:dev` (this creates the `dist/` folder with the bundled code)
5. Open Thunderbird.
6. Go to `Tools` > `Add-ons and Themes`.
7. Click the gear icon (⚙️) and choose `Load Temporary Add-on...`.
8. Navigate to your cloned repo folder and select the `manifest.json` file.

## How it works

1. **Open an email:** Find the email you want to turn into a ticket.
2. **Click the add-on button:** In the Thunderbird toolbar (usually top right), click the add-on button to open the small window.
3. **Select a project:** Start typing in the search field to find your GitLab project and select it from the list.
4. **Review title & description:** The title comes from the email subject, and the description is the full email thread. Adjust as needed.
5. **Create the ticket:** Click "Create Ticket". The add-on sends everything to GitLab, and boom — the issue is created!

## Configuration

The first time you use it, you'll be asked to provide the GitLab URL and a personal access token.
- **Important:** This token needs API access rights.

[More information on options](./md/OPTIONS_en.md)

### Project structure

[Structure](./md/STRUCTURE_en.md)

### Build commands

* **Install dependencies:** `npm install`
* **Build the project:** `npm run build`
* **Auto-build on changes:** `npm run watch`

#### Extras

[VENDORS](./src/libs/VENDORS.md)
