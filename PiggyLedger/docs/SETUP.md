# Setting up PiggyLedger on GitHub Pages

PiggyLedger is a plain HTML/CSS/JS site — there is no build step. You can put it
on GitHub Pages in about 10 minutes. This guide walks through everything,
including the one-time Firebase step that lets the same family's data show up
on every device (parent's phone, kid's Fire tablet, etc).

If you skip the Firebase step, the site still works great — it just runs in
**demo mode**, where each browser/device keeps its own separate local copy of
the data instead of syncing.

## What you'll end up with

- A live site at `https://<your-github-username>.github.io/<repo-name>/`
- A parent dashboard to add/spend money, set interest rates, and automate allowance
- A kid page (bookmarkable, no login) that shows their balance and a savings simulator
- Real-time sync across every device your family uses, backed by a free Firebase project

---

## Part 1 — Create your GitHub repository

1. Sign in to [GitHub](https://github.com) and click **New repository**.
2. Name it anything you like (e.g. `piggyledger`). Keep it **Public** (GitHub Pages
   on the free tier requires a public repo, unless you have GitHub Pro/Team/Enterprise).
3. Don't add a README/gitignore/license — you already have a project folder.
4. Push this project's files to the repo:

   ```bash
   cd piggyledger
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```

## Part 2 — Turn on GitHub Pages

1. In your repo on GitHub, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Under **Branch**, choose `main` and folder `/ (root)`, then **Save**.
4. Wait 1–2 minutes, then refresh the page — GitHub shows a green banner with
   your live URL: `https://<your-username>.github.io/<repo-name>/`.
5. Open that URL. You should see the PiggyLedger home page in **demo mode**
   (there's a small banner at the top saying so). That's expected until you
   finish Part 3.

You can stop here if you're happy with demo mode (see "Understanding the
security model" below for what that means). Otherwise, continue to Part 3 for
real cross-device sync.

## Part 3 — Create a free Firebase project (for cross-device sync)

Firebase's free "Spark" plan easily covers a single family's usage — this
costs nothing under normal use.

1. Go to the [Firebase console](https://console.firebase.google.com/) and sign
   in with any Google account.
2. Click **Add project**. Give it any name (e.g. "our-family-piggyledger").
   You can disable Google Analytics for this project — it's not needed.
3. Once the project is created, click the **web icon (`</>`)** on the project
   overview page to register a web app. Give it a nickname (e.g. "piggyledger")
   and click **Register app**. You do *not* need Firebase Hosting.
4. Firebase will show a `firebaseConfig` object that looks like this:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "our-family-piggyledger.firebaseapp.com",
     projectId: "our-family-piggyledger",
     storageBucket: "our-family-piggyledger.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456"
   };
   ```

   Keep this tab open — you'll copy these six values in Part 4.

5. In the left sidebar, go to **Build → Firestore Database**, click **Create
   database**, choose a location close to you, and start in **production
   mode**. (You'll paste in your own rules in the next step, so the default
   rules don't matter.)

## Part 4 — Configure the app with your Firebase project

1. Open `assets/js/firebaseConfig.js` in your project.
2. Replace the six `REPLACE_ME` values inside `FIREBASE_CONFIG` with the
   matching values from the `firebaseConfig` object Firebase showed you in
   Part 3, step 4.
3. Generate a random, unguessable **Family ID** — at least 20 characters.
   The easiest way: open any browser's developer console and run
   `crypto.randomUUID()`, then copy the result (it'll look like
   `f47ac10b-58cc-4372-a567-0e02b2c3d479`).
4. Replace `FAMILY_ID`'s value (`'REPLACE_ME_WITH_A_LONG_RANDOM_ID'`) with the
   ID you generated, keeping the quotes.
5. Save the file, then commit and push:

   ```bash
   git add assets/js/firebaseConfig.js
   git commit -m "Configure Firebase project"
   git push
   ```

6. Back in the Firebase console, go to **Firestore Database → Rules**, delete
   everything in the editor, and paste in the entire contents of this
   project's `firestore.rules` file. Click **Publish**.

7. Wait a minute for GitHub Pages to redeploy (check the **Actions** tab in
   your repo for a green checkmark), then reload your site's URL. The demo
   mode banner should be gone — you're now syncing to your own Firebase
   project. Any change a parent makes will show up on the kid's device (and
   vice versa for the simulator) the moment either device is online.

### Nothing here is a secret

The six values you pasted into `firebaseConfig.js` are safe to have in a
public GitHub repo — Firebase web API keys aren't secret credentials, they're
just an address book entry that tells the Firebase SDK which project to talk
to. All the actual protection comes from `firestore.rules`, which is why
that file matters and the JS config file doesn't.

---

## Understanding the security model

This app intentionally has **no accounts and no passwords** by default, so
that any family member can open it from any browser or Fire tablet with zero
friction. Here's how that's kept reasonably safe:

- Every family's data lives at a Firestore path like
  `families/<your-random-family-id>/...`. Nobody can read or write your data
  unless they know your exact Family ID string.
- Your Family ID never appears anywhere public — it's not in your GitHub
  repo's commit history in a meaningful way (it's just a string in a JS
  file), it's not shown in any UI, and it's not guessable (a random 20+
  character ID has effectively zero chance of being brute-forced).
- Bookmarked kid links (`kid.html?kid=...`) only ever reveal a kid's own
  short internal ID (e.g. `kid_1`) — never the Family ID itself, since the
  Family ID is baked into `firebaseConfig.js`, not the URL.
- The optional **parent PIN** (see `docs/USAGE.md`) is a convenience lock for
  a shared household device — a curious kid poking at the family iPad
  shouldn't stumble into the parent dashboard. It is **not** meant to stop a
  determined outside attacker; it's UI-level, not a real authentication
  system.

If your repo is public, in principle anyone who inspects your site's source
code could find your Family ID and, in theory, read or write your family's
data. In practice this requires someone to specifically go looking at your
GitHub repo's file contents and know what they're looking at — there is no
listing, search index, or link that surfaces it. If that residual risk
matters to you (e.g. you're on a very public GitHub profile), consider making
the repo private (requires GitHub Pro or a paid Pages plan) or upgrading to
real authentication as described next.

## Upgrading security later

If you eventually want real password-style protection instead of relying on
an unguessable Family ID, the clean upgrade path is **Firebase
Authentication**:

1. In the Firebase console, go to **Build → Authentication → Sign-in method**
   and enable a provider (Email/Password is simplest for a family).
2. Create one login per parent under **Authentication → Users**.
3. Update `firestore.rules` to require `request.auth != null` instead of (or
   in addition to) the family-ID-length check, e.g.:

   ```
   allow read, write: if request.auth != null && familyId.size() >= 20;
   ```

4. Add a small sign-in screen to `parent.html` using the Firebase Auth SDK
   (already loaded via the same CDN pattern used elsewhere in this project).
5. Kid pages can stay exactly as they are — the security upgrade only needs
   to gate the parent dashboard, since kids never write data, only view it
   and run "what if" simulations locally.

This is a deliberate design choice: the data layer (`assets/js/familyStore.js`)
and the rules structure were both built so that adding Auth later is a rules
change plus a login screen — not a rebuild.

---

## Troubleshooting

- **Still see the "demo mode" banner after configuring Firebase** — double
  check every value in `firebaseConfig.js` was replaced (no `REPLACE_ME` left)
  and that `FAMILY_ID` is 20+ characters. Also confirm GitHub Pages finished
  redeploying (Actions tab).
- **"Missing or insufficient permissions" errors** — your Firestore rules
  weren't published, or your Family ID is shorter than 20 characters. Recheck
  Part 4, steps 3–4 and 6.
- **Changes on one device don't show up on another** — both devices need to
  be online and pointed at the exact same deployed URL/config. Demo mode
  (unconfigured Firebase) never syncs between devices by design.
- **A kid's bookmark stopped working after you re-deployed** — kid links only
  break if you delete that kid from the parent dashboard. Re-adding a kid with
  the same name creates a new link.
