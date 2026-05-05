# Local Fake Login

This document explains the development-only login bypass that lets this frontend
open protected routes without a backend API.

## Why It Exists

The local app can run without a `.env` file, but normal login requires backend
variables such as:

```sh
REACT_APP_BASE_API=...
REACT_APP_API_VERSION=...
```

When `REACT_APP_BASE_API` is missing, real login cannot call `/auth/login`.
The fake login path provides a local-only user so the UI can be explored.

## Activation Condition

The bypass is active only when both conditions are true:

```ts
process.env.NODE_ENV === 'development'
!process.env.REACT_APP_BASE_API
```

That logic lives in:

```text
src/store/auth.ts
```

If `REACT_APP_BASE_API` is set, the app uses the real backend login flow.

## Test Credentials

Use these on the sign-in page:

```text
Email: fake.test@example.com
Password: Password1
```

Any other credentials are rejected with a snackbar message.

## How The Login Bypass Works

The Redux thunk `postLogin` normally calls:

```ts
axiosInstance.post('/auth/login', body)
```

For local fake-login mode, it returns a fake successful login response before
making any network request:

```ts
return {
  code: 0,
  data: createFakeUser(),
};
```

The fake response has the same rough shape the reducer expects from the real
backend:

```ts
{
  access_token,
  refresh_token,
  id,
  email,
  company,
  fullname,
  phone,
  role,
  listUserFunCurrencies
}
```

The existing fulfilled reducer then runs normally:

```ts
setTokenCookie(action.payload.data.access_token, action.payload.data.refresh_token);
BaseSocket.getInstance().reconnect();
```

This means the app still uses the normal cookie-based private-route check:

```text
src/routes/PrivateRoute.tsx
```

`PrivateRoute` only checks whether an `access_token` cookie exists, so the fake
token is enough to enter protected pages.

## Fake JWT Tokens

The helper `createFakeJwt` creates unsigned local JWT-like strings:

```ts
header.payload.
```

They are not secure tokens and are not accepted by a real backend. They only
exist so the existing `jwt_decode` and cookie-expiry code can keep working in
local development.

## Fake Current User

The `getMe` thunk also has a local fake response. This matters because after a
browser refresh the app sees the fake `access_token` cookie and calls `getMe`.
Without the fake `getMe`, the app would try to call `/users/me` against a
missing backend.

## reCAPTCHA Bypass

The sign-in form normally requires `isVerify`, which is populated by
`react-google-recaptcha`.

When fake-login mode is active and no reCAPTCHA site key is configured, the
initial Formik value is set to:

```ts
isVerify: 'dev'
```

The reCAPTCHA widget is also not rendered, which prevents this browser error:

```text
Missing required parameters: sitekey
```

That logic lives in:

```text
src/pages/SignIn/SignIn2.tsx
```

## Limitations

This bypass only opens the frontend shell and protected routes. It does not
mock the whole backend.

Features that require real APIs, sockets, SOR services, blockchain data, or
configured environment variables may still show empty data or request failures.

## Files Involved

```text
src/store/auth.ts
src/pages/SignIn/SignIn2.tsx
src/routes/PrivateRoute.tsx
src/helpers/storage.ts
```

