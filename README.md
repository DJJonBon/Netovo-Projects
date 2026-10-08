# Netovo Fax frontend

A portable React + TypeScript + Vite customer portal foundation. **Demo only: no live fax transmission, authentication, email notifications, or Azure/provider access is implemented.** All organizations, numbers, roles, and fax records are fictional.

## Run locally or in Replit

Use Node.js 22.12 or newer (Node.js 24 recommended) and npm:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (normally port 5173). The development server binds to `0.0.0.0` for hosted workspaces. In Replit, import the repository, use the same commands, and expose the Vite port. No Replit backend services are required. Set a different port with `npm run dev -- --port 3000` if necessary.

```sh
npm test
npm run build
npm run preview
```

`dist/` is the production static artifact. Deploy its contents to a static host such as Azure Static Web Apps or an appropriately configured Azure App Service. `npm run preview` is for local verification, not a production web server. Relative build asset paths support mounting under a host-selected path; verify the deployed base path and trailing-slash behavior. No environment variables are currently required; `.env.example` contains only a commented, nonsecret future placeholder.

## Demo walkthrough

1. In Send Fax, select an assigned number and enter `+12025550187`.
2. Browse for or drop one synthetic test PDF (up to 20 MB). Expand the local preview. Documents are excluded from the Git repository.
3. Review the sender, recipient, and document, then choose **Simulate send**.
4. Status progresses from queued to sending after approximately 2 seconds, then delivered after approximately 6 seconds. Open Fax History to inspect the timeline.
5. Search, filter by status/date, and paginate. Use **Demo: simulate load error** to exercise retry; search for an unmatched phrase for the empty state.
6. Switch the **Demo-only organization** selector to inspect isolated fictional records. This clears the current screen's file/preview state. Refreshing resets all demo submissions.
7. Open `/?embedded=1` to preview the compact presentation. It removes the sidebar/header and retains compact screen tabs. This does not authenticate users or verify 3CX embedding.

Files stay in browser memory and are not uploaded or put in localStorage. Preview object URLs are revoked when replaced, removed, submitted, or when leaving the send screen. Demo history contains metadata only. Opening a PDF in another tab can keep that browser tab's rendered copy visible until the user closes it.

## Repository preparation

The project has a lockfile, `.gitignore`, no secrets, and a private npm package flag. That flag prevents accidental npm publication; **GitHub repository visibility is a separate setting**. Create an empty **private** GitHub repository in your chosen account, then from this folder:

```sh
git init
git add .
git commit -m "Build Netovo Fax demo frontend foundation"
git branch -M main
git remote add origin <YOUR_PRIVATE_REPOSITORY_URL>
git push -u origin main
```

No GitHub repository is created or published by this project. Review staged files before pushing. See [FRONTEND_HANDOFF.md](./FRONTEND_HANDOFF.md) for backend integration and iframe requirements.
