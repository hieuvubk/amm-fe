# Local Setup

This project is an older Create React App frontend. It does not run reliably on
modern Node versions such as Node 22 because several dependencies use older
native build tooling.

## Required Toolchain

- Node.js `14.16.1`
- Yarn `1.22.10`

Use `yarn`, not `npm`. The repo has both `package-lock.json` and `yarn.lock`,
but the documented project setup uses Yarn.

## Install Node And Yarn

If `nvm` is installed through Homebrew, load it in your shell:

```sh
export NVM_DIR="$HOME/.nvm"
. "$(brew --prefix nvm)/nvm.sh"
```

Install and use the project Node version:

```sh
nvm install 14.16.1
nvm use 14.16.1
```

Install Yarn if needed:

```sh
npm install -g yarn@1.22.10
```

Check versions:

```sh
node -v
yarn -v
```

Expected:

```text
v14.16.1
1.22.10
```

## Install Dependencies

Start from a clean dependency tree:

```sh
rm -rf node_modules
yarn install --frozen-lockfile
```

Some optional native packages may warn or fail to build, such as `node-hid` or
`sodium-native`. Yarn reports these as optional; they are not required for the
frontend dev server to compile.

## Run The App

Port `3000` may already be in use, so this setup uses `3010`:

```sh
export NVM_DIR="$HOME/.nvm"
. "$(brew --prefix nvm)/nvm.sh"
nvm use 14.16.1
PORT=3010 BROWSER=none yarn start
```

Open:

```text
http://localhost:3010
```

The app currently compiles with many lint warnings. These warnings do not block
the local dev server.

## Local Fake Login

If no backend API is configured with `REACT_APP_BASE_API`, the local development
build supports a fake login for exploring protected routes.

Use:

```text
Email: fake.test@example.com
Password: Password1
```

This fake login is development-only and only active when `REACT_APP_BASE_API` is
not set. It does not create a real backend account.

## Environment Notes

There is no `.env` file checked into this repo. Without backend environment
variables, API-backed features will show empty data or request failures.

Common variables for a real environment include:

```sh
REACT_APP_BASE_API=...
REACT_APP_API_VERSION=...
REACT_APP_BASE_SOCKET=...
REACT_APP_HORIZON=...
REACT_APP_NETWORK_PASSPHRASE=...
REACT_APP_GOOGLE_RECAPTCHA_SITEKEY=...
```

For local development with an insecure Horizon URL, the app uses
`src/helpers/stellarServer.ts` to allow non-HTTPS Horizon connections.

For local development without a reCAPTCHA site key, the sign-in page hides the
reCAPTCHA widget when fake login mode is active.

## Troubleshooting

### `ERESOLVE unable to resolve dependency tree`

This happens with newer npm versions because old dependencies declare old React
peer ranges. Use Yarn 1 with Node 14 instead of `npm install`.

### `node-gyp` fails on Node 22

Use Node `14.16.1`. Node 22 is too new for this dependency set.

### `Failed to load config "react-app"`

The project needs CRA 4 ESLint dependencies available at the app root. This repo
now includes the required dev dependencies in `package.json`.

### `Cannot connect to insecure horizon server`

Use the current code path through `src/helpers/stellarServer.ts`. If this still
appears in the browser, hard refresh the tab or restart the dev server so the
old hot-update bundle is not reused.

