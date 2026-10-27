# DRP notification demo

One website, three parts:

| Address | What it is | Who uses it in the demo |
|---|---|---|
| `/` | **Teacher site.** A StoryWeaver-style reading platform. Phones open it, sign in and turn on reminders. | The phone in the CXO's hand |
| `/studio/` | **Nudge Studio.** Pick a drop-off trigger, pick who gets it, send. | You, on the projected laptop |
| `/push/` | **Push console.** Our own OneSignal-style push service: phones, segments, messages and per-phone delivery. | You, to show it's a real system |

It runs entirely on Netlify's free plan. Nothing runs on your laptop, so any computer with a browser can present it. Notifications are real web push through Google's and Apple's push networks. They arrive with the site closed and the phone locked.

---

## 1. Put it online (one time, about 10 minutes)

You need a free **GitHub** account and a free **Netlify** account. Sign up to Netlify with "Continue with GitHub" and you only log in once.

### Step A: put the files on GitHub
1. Unzip `drp-push-demo.zip`. You get a folder called `drp-push-demo`.
2. On GitHub, click **New repository**. Name it `drp-push-demo`, choose **Private**, and click **Create repository**.
3. On the empty repository page, click the link **uploading an existing file**.
4. Open the `drp-push-demo` folder on your computer and select **everything inside it**: `lib`, `netlify`, `public`, `dev`, `netlify.toml`, `package.json` and `README.md`. Drag them all onto the GitHub page, then click **Commit changes**.
5. Check the repository's front page. You should see `netlify.toml` and `package.json` at the top level. If you see a single `drp-push-demo` folder instead, you dragged the folder rather than its contents: delete the repository and try again.

### Step B: deploy on Netlify
1. On Netlify, click **Add new project**, then **Import an existing project**, then **GitHub**, and authorise if asked.
2. Pick the `drp-push-demo` repository. Leave every setting as it is and click **Deploy**.
3. Wait about a minute, until the status shows **Published**. Your address looks like `https://random-name-123.netlify.app`.
4. Optional but nicer: go to **Project configuration**, choose **Change project name**, and pick something like `drp-reading-demo`.

### Step C: set your own passcode (recommended)
The Studio and console ask for a passcode. It is `drp-demo` unless you set your own:
1. Go to **Project configuration**, then **Environment variables**, and add `ADMIN_PASSCODE` with a value only you know.
2. Go to **Deploys**, then **Trigger deploy**, then **Deploy project**.

**Check that it worked:** open `https://<your-site>/studio/`, enter the passcode, and you should see a QR code.

---

## 2. Before the demo: set up and test your own phone (5 minutes)

### Android (Chrome)
1. Scan the QR code in the Studio, or type the address.
2. Sign in with any name, pick a class, then tap **Turn on reminders** and **Allow**.
3. Tap **Send me a test reminder** and lock the phone. It should light up within about 5 seconds.

### iPhone (iOS 16.4 or later)
iPhones only allow web reminders for sites added to the Home Screen.
1. Open the address in **Safari**. Tap **Share**, then **Add to Home Screen**, then **Add**.
2. Open **DRP Reading** from the Home Screen icon, not from Safari.
3. Sign in, tap **Turn on reminders**, then **Allow**. Then run the test as above.

### Phone settings that matter for the lock screen
- **Android:** Settings → Notifications → Chrome: allowed, and shown on the lock screen. Turn Do Not Disturb off. Battery saver can delay delivery by minutes, so turn it off for the demo.
- **iPhone:** Settings → Notifications → DRP Reading: Allow, with Lock Screen on. Turn Focus off.

---

## 3. Demo script (about 5 minutes)

Have the Studio open on the projected laptop, and the push console open in a second tab.

| # | What you do | What you say |
|---|---|---|
| 1 | Show the Studio | "This is the panel the programme team uses to nudge teachers." |
| 2 | Hand over a phone, or ask the CXO to scan the QR code with theirs. Sign in and tap **Turn on reminders**. | "Any teacher's phone. No app to install." The phone appears in the Studio within a few seconds. |
| 3 | Ask them to **lock the phone** | |
| 4 | Pick **Enrolled, no first session**. Set **Send to** to their phone, tick **Ignore guardrails**, and click **Send nudge**. | The phone lights up on the lock screen. "That's a real push, through Google's or Apple's network, to a locked phone." |
| 5 | They tap the notification | It opens the teacher site on the right screen. In the Studio, the row shows **Shown 1, Opened 1**. "We know it landed, and we know it worked." |
| 6 | On the phone, open today's story, page through it and leave without submitting. In the Studio, pick **Activity not submitted**. | The audience switches to **Activity pending · 1 phone**. "Rules decide who gets which message." |
| 7 | Set **When** to **In 10 seconds**, click **Send nudge**, and lock the phone | The nudge arrives while the phone is asleep. Tapping it opens the pending activity. |
| 8 | In the push console, go to **Audience**, click **Edit tags** and set days inactive to 8. Then go to **Segments**. | **Quiet 7+ days** now counts 1. "Segments update as teachers read or stop reading." |
| 9 | Click **Message this segment**, pick template **L2**, and send | "The team can target any group of teachers without an engineer." |
| 10 | Open **Messages** and click the row | Per-phone result: accepted by the push network, shown, opened. |
| 11 | *(optional)* In the Studio's **WhatsApp** tab, type your number and click **Open in WhatsApp** | "The same message logic carries over to WhatsApp." |

---

## 4. If something goes wrong

| Symptom | Fix |
|---|---|
| The phone never shows a notification | Check that notifications are allowed for Chrome or DRP Reading and that Do Not Disturb or Focus is off. On iPhone, open the app from the Home Screen icon. Use **Send me a test reminder** in the phone's settings screen. |
| The console shows **Failed · 403** or **400** | The phone subscribed with an old key. On the phone, open settings (the gear), turn reminders off, then on again. |
| A phone disappeared from Audience | It turned reminders off, or the push network said the subscription expired. Turning reminders on again brings it back. |
| The Studio says no phones match | That segment is empty. Pick **All subscribers** or one phone. |
| The passcode is not accepted | Use the `ADMIN_PASSCODE` you set, or `drp-demo` if you didn't set one. |
| The Netlify deploy failed | `netlify.toml` and `package.json` must sit at the top of the repository, not inside a folder. |
| The QR code is blank | The demo laptop is offline or blocks `cdnjs.cloudflare.com`. Type the address shown next to it instead. |

---

## 5. How it works

1. **The teacher site** registers a service worker and subscribes the phone with the browser's Push API, signed with this site's own VAPID key. The key is created automatically on first use.
2. **`/api/subscribe`** stores the phone's subscription and tags (grade, books done, days inactive, streak, activity pending) in Netlify Blobs.
3. **The Studio and console** call `/api/send` with a message, an audience and a link. The function personalises the message for each phone, signs it, and posts it to that phone's push network with high urgency, which wakes a sleeping Android phone.
4. **The phone's operating system** wakes the service worker even when locked. The service worker shows the notification and reports **shown**. A tap reports **opened** and opens the exact screen.

### Moving to production
- The Studio only talks to `/api/send`, so this push service can be swapped for OneSignal or Firebase without changing the Studio.
- Use StoryWeaver's real `teacher_id` as the phone's identity, so one teacher's phone and laptop are both reached.
- Run the triggers from a scheduled job that reads the session log, instead of sending them by hand.
- Put real logins in front of the Studio and console.

---

## Files

| Path | What it is |
|---|---|
| `public/` | The three web pages, the service worker (`sw.js`), the manifest and icons |
| `public/shared/triggers.js` | The trigger library and segment rules shared by the Studio and console |
| `netlify/functions/api.mjs` | The serverless function behind `/api/*` |
| `lib/core.mjs` | The push service itself: subscribe, segments, personalise, send, track |
| `dev/server.mjs` | Optional local server for developers (`npm install`, then `npm run dev`) |
| `netlify.toml` | Netlify settings. Nothing to change. |
