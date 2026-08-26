/**
 * Firebase Phone Auth — the SMS one-time code behind "sign in with your mobile number".
 *
 * <h2>Why Firebase and not our own SMS</h2>
 * Texting a one-time code to an Indian mobile requires a DLT sender and template
 * registration with TRAI, which this business does not hold — so the backend's own
 * `SmsSender` delivers nothing and every SMS flow in the app is dark. Firebase sends
 * the code over Google's own registered routes. No DLT, no SMS gateway account, and
 * nothing to implement on our side beyond this file.
 *
 * <h2>How the pieces fit</h2>
 * The whole code exchange happens HERE, in the browser, with Firebase directly. Our
 * backend never sees a code. What it gets at the end is the Firebase ID token: a
 * short-lived JWT, signed by Google, asserting "this browser proved control of
 * +919876543210". `POST /api/auth/phone/firebase` verifies that against Google's
 * public keys and against our own project id, then issues an ordinary HueVista
 * session — the same access + refresh pair every other sign-in produces.
 *
 * <h2>These values are public, and that is fine</h2>
 * A Firebase web API key is an identifier, not a credential: it names the project a
 * request is for. It is meant to ship in the bundle, which is why every value here is
 * `NEXT_PUBLIC_`. What actually protects the project is the authorised-domains list
 * (Firebase console → Authentication → Settings) and, on the backend, the project-id
 * check that refuses a token minted by anyone else's project.
 *
 * <h2>Loading</h2>
 * The SDK is imported dynamically, inside the functions that need it, so the ~200 kB
 * of Firebase auth never lands in the bundle of anyone who does not open the mobile
 * sign-in page.
 */

/**
 * `NEXT_PUBLIC_*` is substituted at BUILD time by a literal-text match on
 * `process.env.NEXT_PUBLIC_NAME`, so each one has to be written out in full. Reading
 * them through a variable or a loop yields undefined in the browser — the value was
 * never inlined — and the failure looks like a misconfigured Firebase project rather
 * than a bundler rule.
 */
function env(value: string | undefined): string {
  return value?.trim() ?? "";
}

export const firebaseConfig = {
  apiKey: env(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: env(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: env(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  appId: env(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
} as const;

/**
 * Whether mobile sign-in can work at all in this build.
 *
 * The sign-in page uses it to HIDE the option rather than show a button that throws
 * the moment it is pressed. Blank counts as unset: `ENV FOO=${FOO}` in a Dockerfile
 * with no `--build-arg` sets an empty string, and `??` would happily accept it — the
 * same trap `lib/config.ts` documents for the API origin.
 *
 * `appId` is deliberately not required: Firebase Auth works without it (it is for
 * Analytics), and demanding it would turn a working setup into a hidden button.
 */
export const phoneSignInEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
);

/** The confirmation handle returned by {@link sendSmsCode}, passed back to {@link confirmSmsCode}. */
export interface SmsConfirmation {
  confirm(code: string): Promise<{ user: { getIdToken(): Promise<string> } }>;
}

type RecaptchaHandle = { clear(): void };

/** The invisible reCAPTCHA for the current attempt, so a retry can dispose of it. */
let recaptcha: RecaptchaHandle | null = null;

async function getAuthInstance() {
  const { getApps, initializeApp } = await import("firebase/app");
  const { getAuth } = await import("firebase/auth");
  // initializeApp throws on a second call with the same name; React strict mode and
  // client-side navigation both make that a real possibility.
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  // Send the SMS in the browser's language where Firebase has a translation for it.
  auth.useDeviceLanguage();
  return auth;
}

/**
 * Ask Firebase to text a one-time code to `phone` (E.164, e.g. +919876543210).
 *
 * <p>Firebase requires a reCAPTCHA to prove the request came from a person before it
 * will spend an SMS. The invisible variant solves itself for almost everyone and only
 * shows a challenge when the traffic looks automated, so there is normally nothing to
 * click — but the container element must exist in the DOM before this is called.
 *
 * @param containerId id of an empty element the reCAPTCHA can mount into
 */
export async function sendSmsCode(phone: string, containerId: string): Promise<SmsConfirmation> {
  const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
  const auth = await getAuthInstance();

  // A verifier is single-use: Firebase consumes its token on send, so a resend or a
  // corrected number needs a fresh one. Reusing the old one fails with an opaque
  // "reCAPTCHA has already been rendered" that reads like a bug in the number.
  clearRecaptcha();
  const verifier = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
  recaptcha = verifier;

  try {
    return await signInWithPhoneNumber(auth, phone, verifier);
  } catch (error) {
    // Leaving a spent verifier mounted breaks the retry the user is about to make.
    clearRecaptcha();
    throw error;
  }
}

/**
 * Check the code the customer typed and return the Firebase ID token for our backend.
 *
 * <p>The Firebase session is signed out immediately afterwards. We do not use it for
 * anything — the HueVista session cookie is what the app runs on — and leaving it in
 * the browser's IndexedDB would mean a second, invisible identity sitting on a shared
 * or in-store device long after the customer walked away.
 */
export async function confirmSmsCode(confirmation: SmsConfirmation, code: string): Promise<string> {
  const credential = await confirmation.confirm(code.trim());
  const idToken = await credential.user.getIdToken();
  clearRecaptcha();
  try {
    const { signOut } = await import("firebase/auth");
    await signOut(await getAuthInstance());
  } catch {
    // Best-effort tidying: we already hold the token, and failing to clear a local
    // Firebase session must not fail a sign-in that has actually succeeded.
  }
  return idToken;
}

/** Dispose of the current reCAPTCHA widget, if any. Safe to call at any time. */
export function clearRecaptcha() {
  try {
    recaptcha?.clear();
  } catch {
    // Already gone, or the element was unmounted first. Nothing to do.
  }
  recaptcha = null;
}

/**
 * Firebase's error codes turned into something worth reading.
 *
 * <p>The raw messages are written for developers ("FirebaseError: Firebase: Error
 * (auth/invalid-phone-number)") and several of them name the fix in terms of console
 * settings the customer cannot see. The two that matter most are the configuration
 * ones — an unauthorised domain and a disabled provider are what a fresh setup gets
 * wrong, and the console message for each is the only thing that says so.
 */
export function phoneAuthErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
  switch (code) {
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
      return "That doesn't look like a valid mobile number. Check the country code and try again.";
    case "auth/invalid-verification-code":
      return "That code isn't right. Check the text and try again.";
    case "auth/code-expired":
      return "That code has expired. Ask for a new one.";
    case "auth/too-many-requests":
      return "Too many attempts from this device. Please wait a few minutes and try again.";
    case "auth/quota-exceeded":
      return "We can't send any more codes right now. Please try again later, or sign in with your email.";
    case "auth/captcha-check-failed":
      return "That security check didn't pass. Please reload the page and try again.";
    case "auth/network-request-failed":
      return "We couldn't reach the network. Check your connection and try again.";
    case "auth/unauthorized-domain":
    case "auth/operation-not-allowed":
      // A setup problem, not the customer's: the domain is missing from Firebase's
      // authorised list, or Phone sign-in was never switched on for the project.
      console.error("Firebase phone sign-in is not configured for this domain:", error);
      return "Signing in by mobile isn't available here yet. Please use your email.";
    default:
      if (code) console.error("Firebase phone sign-in failed:", error);
      return "We couldn't send that code. Please try again, or sign in with your email.";
  }
}
