# AIR BEE Frontend

React + Vite frontend for AIR BEE, an AI-powered hospitality operations platform.

## Requirements

- Node.js 18+
- npm 9+

## Local development

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

## Environment variables

Create `frontend/.env.local` with:

```env
VITE_COGNITO_USER_POOL_ID=...
VITE_COGNITO_CLIENT_ID=...
VITE_API_URL=https://<api-id>.execute-api.ap-south-1.amazonaws.com
```

## Deployment

This repo is configured for AWS Amplify using [amplify.yml](/f:/hackaton/amplify.yml).
