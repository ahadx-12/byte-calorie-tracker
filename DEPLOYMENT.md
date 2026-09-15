# Deploy Byte Milad on AWS Amplify

Byte Milad is a static application. The AWS host only serves files; private diary data stays on each user's device. There is no backend to deploy.

## Option 1: Connect GitHub

1. In the AWS console, open **AWS Amplify** and create a new app.
2. Choose GitHub as the source provider and authorize access to the Byte Milad repository.
3. Select the repository and the `main` branch.
4. Use the included `amplify.yml`: build command `node scripts/build.mjs`, output directory `dist`.
5. Save and deploy. Wait for the deployment to finish, then open its HTTPS address.
6. Under hosting custom headers, check that `customHttp.yml` has been applied. It defines security headers and revalidation for application files.

No environment variables or API keys are required. If the console suggests SSR hosting or a backend environment, choose static hosting. Future pushes to the connected branch trigger deployment.

The scanner decoder is committed in `public/vendor/`. Serve those files along with `scanner.js` and `scan-model.js`. The CSP in `customHttp.yml` permits connections to `https://world.openfoodfacts.org` and local blob images/video for photo and camera scanning. If you previously added custom headers in the AWS console, update them to match; an old `connect-src 'self'` policy will block lookups. Camera access needs HTTPS and the user's browser permission. In browsers that do not expose a camera, photo decoding and typed codes remain available.

## Option 2: Upload the deployment ZIP

Use the supplied `byte-aws-deploy.zip`, or build a new one:

```sh
npm run build
cd dist
zip -r ../byte-aws-deploy.zip .
```

In AWS Amplify, choose **Create new app → Deploy without Git → Drag and drop**. Choose an app name and branch name, upload the ZIP, and select **Save and deploy**.

The ZIP must have `index.html` at its root, not inside a `dist` folder. For a manual deployment, apply the headers from `customHttp.yml` in the Amplify console if desired; that file is repository configuration, not a public asset.

[AWS manual deployment instructions](https://docs.aws.amazon.com/amplify/latest/userguide/manual-deploys.html).

## First-use check

1. Visit the deployed HTTPS address and add a test food.
2. Reload and confirm that the entry is still present.
3. On iPhone Safari, use **Share → Add to Home Screen**. Open the installed app while online once.
4. Turn on airplane mode and reopen it. Log another test food, then reload.
5. Turn networking back on, export a backup, and store the file safely.
6. Delete test entries (or use a separate test profile).

The service worker needs HTTPS (localhost is allowed for development). Direct S3 website endpoints are HTTP-only; use Amplify or CloudFront for installation/offline support. A custom domain is optional.

## Updates and data

Increment `CACHE` in `public/sw.js` whenever application assets change, commit, and deploy. Users should close all Byte Milad tabs and reopen once online to activate the new cache. Do not clear browser storage as an update procedure.

Changing the hosting address creates a different browser storage area. Export from the old address and restore at the new one. No private user data is in this repository or the deployment ZIP.

## Cost

The application uses no paid API, subscription, database or server instance. The bundled scanner is open source, and Open Food Facts provides free product lookup. AWS hosting/build/transfer fees can apply under your account's pricing and free-tier eligibility. Select billing alerts appropriate to your account. No AWS resources have been created by these files.
