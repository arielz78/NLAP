import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — Vaughan Brief",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="login-page">
      <div className="brand-lockup">
        <div className="brand-mark">VB</div>
        <div>
          <span className="brand-name">Vaughan Brief</span>
          <span className="brand-product">Editor console</span>
        </div>
      </div>
      <h1>Sign in</h1>
      {error === "1" && (
        <p className="login-error" role="alert">
          That username or password is not right. Please try again.
        </p>
      )}
      {/* A plain form post: it works before any JavaScript loads, and password managers know it. */}
      <form className="login-form" method="post" action="/api/login">
        <label>
          Username
          <input
            type="text"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
          />
        </label>
        <label>
          Password
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="login-button">
          Sign in
        </button>
      </form>
    </main>
  );
}
