# Quickstart: Installable App

## Automated checks (run locally before any push)

```sh
npm run lint && npm run typecheck && npm run build
npm run test:coverage
npx stryker run --force --mutate "<changed files>"
npm run test:e2e        # includes the @installable spec against a production build
```

## Manual checks (after deploy, on real phones)

### iPhone (Safari, iOS 16.4+)

1. **Add it**: Open the site, then choose **Share → Add to Home Screen**. The name is "Job
   Tracker" and the icon is the chrome briefcase
   launching over a neon sunset.
2. **Open it**: Tap the icon. It opens on the board, full screen, with no address bar.
3. **Sign in**: Sign out, then sign in. You finish in the app, not in Safari.
4. **Links**: Open a job posting link. It opens in Safari, and the app stays where it was.
5. **Updates**: After the next deploy, close the app and open it again. The change is there.
6. **Offline**: In airplane mode, open the app. It shows the offline message, with no error
   page. Turn airplane mode off, and the board loads.

### Android (Chrome)

1. **Install it**: Open the site, then choose **⋮ → Install app**. "Job Tracker" appears with
   its icon.
2. **Repeat**: Do steps 2–6 above.

### Website

The site in a desktop browser looks and works as before. Chrome or Edge may show an install
icon in the address bar.
