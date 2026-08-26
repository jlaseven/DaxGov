import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import { useTheme } from "./theme";

const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7];

const SSO_ERRORS: Record<string, string> = {
  not_configured: "JumpCloud single sign-on is not configured.",
  not_provisioned:
    "Your JumpCloud account is not provisioned in DaxGov. Ask an Administrator to create a matching username first.",
  denied: "JumpCloud sign-in was cancelled.",
  invalid: "JumpCloud sign-in could not be completed.",
  disabled: "This account is disabled.",
};

function ssoErrorFromLocation() {
  const code = new URLSearchParams(window.location.search).get("sso_error");
  return (code && SSO_ERRORS[code]) || "";
}

export default function LoginPage() {
  const { refresh } = useAuth();
  const [theme, setTheme] = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(ssoErrorFromLocation);
  const [busy, setBusy] = useState(false);
  const [jumpcloud, setJumpcloud] = useState(false);
  const [passwordLogin, setPasswordLogin] = useState(true);

  useEffect(() => {
    void api("/auth/sso")
      .then((response) => {
        setJumpcloud(Boolean(response.data?.jumpcloud));
        setPasswordLogin(response.data?.passwordLogin !== false);
      })
      .catch(() => {
        setJumpcloud(false);
        setPasswordLogin(true);
      });
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      await refresh();
    } catch (reason) {
      setError("Invalid username or password.");
      void reason;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-atmosphere" aria-hidden="true">
        <span className="login-speedline login-speedline-a" />
        <span className="login-speedline login-speedline-b" />
        <span className="login-speedline login-speedline-c" />
      </div>
      <div className="login-stage">
        <section className="login-hero">
          <p className="login-kicker">Local cybersecurity governance</p>
          <div className="login-mascot">
            <span className="login-halo" />
            <span className="login-halo login-halo-delay" />
            <img
              src="/assets/daxon-comic.png"
              alt="Daxon, the fire-fur cat mascot of DaxGov"
            />
            {SPARKS.map((spark) => (
              <span
                key={spark}
                className={`login-spark login-spark-${spark}`}
              />
            ))}
          </div>
          <div className="login-speech">Ready when you are.</div>
          <h1>DaxGov</h1>
          <p className="login-tagline">
            Registers, assessments, and oversight — kept on this computer.
          </p>
        </section>
        <form className="login-card" onSubmit={submit}>
          <div className="login-card-head">
            <span className="login-card-kicker">Sign in</span>
            <h2>Welcome back</h2>
            <p>
              {jumpcloud
                ? "Use JumpCloud or your DaxGov account to continue."
                : "Use your local DaxGov account to continue."}
            </p>
          </div>
          {jumpcloud && (
            <>
              <a className="login-sso" href="/api/auth/jumpcloud">
                Sign in with JumpCloud
              </a>
              {passwordLogin && <div className="login-divider">or</div>}
            </>
          )}
          {passwordLogin && (
            <>
              <label>
                Username
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                  autoFocus
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
            </>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {passwordLogin && (
            <button className="primary login-submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          )}
          <div
            className="login-theme theme-toggle"
            role="group"
            aria-label="Color theme"
          >
            <button
              type="button"
              className={theme === "light" ? "active" : ""}
              onClick={() => setTheme("light")}
            >
              Light
            </button>
            <button
              type="button"
              className={theme === "dark" ? "active" : ""}
              onClick={() => setTheme("dark")}
            >
              Night
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ChangePasswordPage() {
  const { refresh } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, password }),
      });
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to change password.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-stage">
        <form className="login-card" onSubmit={submit}>
          <div className="login-card-head">
            <span className="login-card-kicker">Security</span>
            <h2>Change the bootstrap password</h2>
            <p>
              The built-in administrator password must be replaced before you
              can use DaxGov. Use at least 12 characters with letters and
              numbers.
            </p>
          </div>
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
              autoFocus
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary login-submit" disabled={busy}>
            {busy ? "Saving…" : "Save password"}
          </button>
        </form>
      </div>
    </div>
  );
}