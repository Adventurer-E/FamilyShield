# 1. Set up your computer

You'll install three free tools, download the code and run the app. Do this once.

## Install the tools

| Tool | What it's for | Get it |
| --- | --- | --- |
| **Node.js** (version 20 or newer) | Runs the app's code and its helper programs. Comes with **npm**, which downloads the libraries the app uses | [nodejs.org](https://nodejs.org): choose the "LTS" download |
| **Git** | Downloads the code and keeps track of every change | [git-scm.com](https://git-scm.com/downloads) |
| **Visual Studio Code** (VS Code) | The editor we use to read and change code | [code.visualstudio.com](https://code.visualstudio.com) |

Check they work. Open a **terminal** (on a Mac: the Terminal app; on Windows:
"Terminal" or "PowerShell") and type:

```bash
node --version    # should print v20.something or higher
git --version     # should print git version 2.something
```

> **What's a terminal?** A window where you type commands instead of clicking.
> In these guides, lines in grey boxes are commands: type them (or copy and
> paste them), then press Enter. Text after `#` is a comment explaining the
> command; you don't need to type it.

## Download the code

```bash
git clone https://github.com/Adventurer-E/FamilyShield.git
cd FamilyShield
code .            # opens the folder in VS Code (or use File → Open Folder)
```

> If `code .` doesn't work, open VS Code and use **File → Open Folder…** to open
> the `FamilyShield` folder.

VS Code has its own terminal: **Terminal → New Terminal**. Use it from now on;
it opens in the right folder automatically.

## Install the libraries

```bash
npm install
```

This reads `package.json` and downloads everything the app needs into a folder
called `node_modules`. It takes a minute or two. You only repeat it when someone
adds a new library (if the app suddenly won't start after you pull new code,
run `npm install` again).

## Run the app

```bash
npm run dev
```

You'll see lines starting with `[server]` and `[bank]`. When you see
`Local: http://localhost:5173/`, open that address in your browser.

You're looking at **BlueRiver Bank**, a made-up bank app. **FamilyShield** is the
card in the middle of its home screen. Tap it and follow the story described on
the right of the page.

To stop the app, click in the terminal and press **Ctrl+C**.

## Recommended VS Code extensions

Open the Extensions panel (the four-squares icon on the left) and install:

- **Rainbow CSV**: makes the CSV files in `data/` readable, with colored columns
- **GitHub Pull Requests**: review and create pull requests without leaving VS Code

## Check everything works

```bash
npm run check
```

This runs every automatic check (types, tests, build), the same ones GitHub
runs on your work. The last line should say the build succeeded. If something
fails on a fresh download, tell the team; it's not your fault.

**Next:** [The big picture →](02-big-picture.md)
