# GitLab Issue Creator | Thunderbird Add-on

This small Thunderbird add-on allows you to **create GitLab issues directly from emails**.

## What does it do?

* **Directly from the email:** Create GitLab issues while you're still viewing the email.
* **Automatic title:** The email subject becomes the issue title automatically!
* **Full context:** The entire email thread is added to the issue description, so everything is crystal clear.
* **Quick project search:** A simple search helps you find the right GitLab project quickly.
* **Customizable:** You can edit the title and description before submitting or add any extra information you need.

## Installation

### Main Method: Install directly in Thunderbird

1. Open Thunderbird.
2. Click the hamburger menu in the top right.
3. Select **Add-ons and Themes**.
4. Enter **GitLab Issue Creator** in the search bar.
5. Open the **GitLab Issue Creator** entry.
6. Click **Add to Thunderbird**.
7. Confirm addition

### Alternative: Install from file

1. Open the add-on page: [GitLab Issue Creator](https://addons.thunderbird.net/en-US/thunderbird/addon/gitlab-issue-creator)
2. Download the file.
3. In Thunderbird, click the hamburger menu in the top right.
4. Select **Add-ons and Themes**.
5. Click the gear icon (⚙️).
6. Choose **Install Add-on From File**.
7. Select the downloaded file and install it.
8. Restart Thunderbird if prompted.

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

1. **Open an email:** Find the email you want to turn into an issue.
2. **Click the add-on button:** In the Thunderbird toolbar (usually top right), click the add-on button to open the small window.
3. **Select a project:** Start typing in the search field to find your GitLab project and select it from the list.
4. **Review title & description:** The title comes from the email subject, and the description is the full email thread. Adjust as needed.
5. **Create the issue:** Click "Create Issue". The add-on sends everything to GitLab, and boom — the issue is created!

## Configuration

The first time you use it, you'll be asked to provide the GitLab URL and a personal access token.
- **Important:** This token needs API access rights.

[More information on options](./md/OPTIONS_en.md)

### Project structure

[Structure](./md/STRUCTURE_en.md)

### Build commands

* **Install dependencies:** `npm install`
* **Build the project:** `npm run build`
