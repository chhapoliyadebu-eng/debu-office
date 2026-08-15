import React, { useState } from "react";
import { signInWithGoogle, signInWithEmail, registerWithEmail, resetPassword, signOutUser } from "../lib/firebase";

export function Login() {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      // No email-domain check here by design — see the comment above
      // isAllowedOfficialEmail's old location in lib/firebase.ts. Any
      // Google account can sign in; a Department Admin/Admin approves
      // the account afterward.
    } catch (err: any) {
      setError(err.message || "Google sign-in failed.");
    }
    setLoading(false);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const result = await signInWithEmail(email, password);
        if (!result.user.emailVerified) {
          await signOutUser();
          throw new Error("Please verify your email address before signing in.");
        }
      } else {
        const result = await registerWithEmail(email, password);
        // The account remains signed in until the verification email is used;
        // the App auth gate will reject unverified password accounts.
        if (!result.user.emailVerified) {
          setInfo("Account created. Verify the email address before using the portal.");
          await signOutUser();
        }
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    }
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Pehle apna email address daalein, phir reset link bhejenge.");
      return;
    }
    setError(null);
    try {
      await resetPassword(email);
      setInfo("Password reset link bhej diya gaya hai " + email + " par.");
    } catch (err: any) {
      setError(err.message || "Reset link bhejne mein dikkat hui.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full border-2 border-gold flex items-center justify-center font-display text-gold text-2xl mx-auto mb-3 bg-navy-deep">
            हर
          </div>
          <h1 className="font-hindi text-xl text-navy">हरियाणा रोडवेज</h1>
          <p className="text-xs text-ink/55 tracking-wide uppercase mt-1">Transport Department Drafting Portal</p>
        </div>

        <div className="noting-sheet rounded-sm">
          <div className="noting-body !py-6">
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 border border-[#d8cfb6] rounded-sm py-2.5 text-sm font-medium hover:bg-[#f4efe1] disabled:opacity-50"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-[#e6dcc2]" />
              <span className="text-[11px] text-ink/40 uppercase tracking-wide">or with email</span>
              <div className="h-px flex-1 bg-[#e6dcc2]" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] text-ink/50">Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@hry.gov.in"
                  className="w-full border-b border-[#d8cfb6] bg-transparent focus:outline-none py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] text-ink/50">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border-b border-[#d8cfb6] bg-transparent focus:outline-none py-1.5 text-sm"
                />
              </div>

              {error && <p className="text-xs text-brick">{error}</p>}
              {info && <p className="text-xs text-seal">{info}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brick hover:bg-brick-deep text-white text-sm font-semibold px-4 py-2.5 rounded-sm disabled:opacity-50"
              >
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            <div className="flex items-center justify-between mt-4 text-xs">
              <button onClick={() => setMode(mode === "signin" ? "register" : "signin")} className="text-navy font-medium hover:underline">
                {mode === "signin" ? "New here? Register" : "Already have an account? Sign in"}
              </button>
              {mode === "signin" && (
                <button onClick={handleForgotPassword} className="text-ink/50 hover:underline">
                  Forgot password?
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-ink/40 text-center mt-4">
          New accounts get read-only "Unassigned" access until an Admin sets your role, designation, and depot/wing.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.6 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.5 0-14 4.2-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6c-2 1.5-4.7 2.6-7.7 2.6-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.9 39.6 16.4 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C41.5 36.3 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}
