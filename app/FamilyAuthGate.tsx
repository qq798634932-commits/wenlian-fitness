"use client";

import {
  ArrowLeft,
  Barbell,
  CheckCircle,
  Copy,
  DeviceMobile,
  EnvelopeSimple,
  Key,
  LockKey,
  SignOut,
  Ticket,
  UserCircle,
  UsersThree,
  Warning,
  X,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import FitnessApp from "./FitnessApp";
import {
  adminAuthPassword,
  formatMemberLoginId,
  getSupabaseClient,
  memberAuthEmail,
  memberAuthPassword,
  normalizeMemberLoginId,
} from "./cloud/client";
import type { CloudSession, Membership, MemberStatus } from "./cloud/client";

type AuthState = "loading" | "signed-out" | "checking" | "active" | "blocked" | "error";
type FamilyView = "fitness" | "admin";
type LoginMode = "redeem" | "login" | "admin";

const ADMIN_EMAIL_STORAGE_KEY = "wenlian-admin-email-v1";

function pinValidationMessage(pin: string, confirmation?: string) {
  if (!/^\d{6}$/.test(pin)) return "密码需要是6位数字。";
  if (/^([0-9])\1{5}$/.test(pin) || pin === "123456" || pin === "654321") {
    return "请不要使用连续数字或6位相同数字。";
  }
  if (confirmation !== undefined && pin !== confirmation) return "两次输入的密码不一致。";
  return "";
}

function rememberedAdminEmail() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ADMIN_EMAIL_STORAGE_KEY) ?? "";
}

type InviteCodeSummary = {
  id: string;
  display_name: string;
  code_hint: string;
  status: "pending" | "claiming" | "redeemed" | "cancelled" | "expired";
  expires_at: string;
  created_at: string;
};

type GeneratedInvite = {
  code: string;
  displayName: string;
  expiresAt: string;
};

export default function FamilyAuthGate({ view = "fitness" }: { view?: FamilyView }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [state, setState] = useState<AuthState>(client ? "loading" : "active");
  const [accountOpen, setAccountOpen] = useState(false);

  const loadMembership = useCallback(async (nextSession: Session) => {
    if (!client) return;
    setState("checking");
    const { data, error } = await client
      .from("memberships")
      .select("user_id,email,login_id,auth_method,display_name,role,status,created_at,updated_at")
      .eq("user_id", nextSession.user.id)
      .maybeSingle();

    if (error) {
      setState("error");
      return;
    }
    setMembership(data as Membership | null);
    setState(data?.status === "active" ? "active" : "blocked");
  }, [client]);

  useEffect(() => {
    if (!client) return;
    let active = true;

    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) void loadMembership(data.session);
      else setState("signed-out");
    });

    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);

      // Token rotation and account updates are expected during long-lived
      // mobile sessions. Keep the current screen mounted so an iPhone wake-up
      // or admin PIN change never interrupts the active view.
      if ((event === "TOKEN_REFRESHED" || event === "USER_UPDATED") && nextSession) return;

      setMembership(null);
      setAccountOpen(false);
      if (nextSession) void loadMembership(nextSession);
      else setState("signed-out");
    });

    const refreshOnResume = () => {
      if (document.visibilityState === "hidden") return;
      void client.auth.getSession().then(({ data, error }) => {
        if (!active || error || !data.session?.expires_at) return;
        const secondsRemaining = data.session.expires_at - Math.floor(Date.now() / 1000);
        if (secondsRemaining <= 5 * 60) void client.auth.refreshSession();
      });
    };

    window.addEventListener("pageshow", refreshOnResume);
    window.addEventListener("online", refreshOnResume);
    document.addEventListener("visibilitychange", refreshOnResume);

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      window.removeEventListener("pageshow", refreshOnResume);
      window.removeEventListener("online", refreshOnResume);
      document.removeEventListener("visibilitychange", refreshOnResume);
    };
  }, [client, loadMembership]);

  useEffect(() => {
    if (membership?.role !== "admin" || !session?.user.email) return;
    window.localStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, session.user.email);
  }, [membership?.role, session?.user.email]);

  if (!client) return <FitnessApp />;
  if (state === "loading" || state === "checking") return <CloudLoading />;
  if (state === "signed-out") return <MemberAccess client={client} />;

  if (state === "error" && session) {
    return (
      <CloudError
        onRetry={() => void loadMembership(session)}
        onSignOut={() => void client.auth.signOut()}
      />
    );
  }

  if (!session || !membership || state === "blocked") {
    return (
      <AccessBlocked
        email={session?.user.email ?? ""}
        onRetry={() => session && void loadMembership(session)}
        onSignOut={() => void client.auth.signOut()}
      />
    );
  }

  const cloudSession: CloudSession = {
    client,
    userId: session.user.id,
    email: session.user.email ?? membership.email,
    membership,
  };

  if (view === "admin") {
    if (membership.role !== "admin") {
      return (
        <AccessBlocked
          email={session.user.email ?? ""}
          onRetry={() => void loadMembership(session)}
          onSignOut={() => void client.auth.signOut()}
        />
      );
    }
    return <AdminPanel session={cloudSession} onClose={() => window.location.assign("./")} />;
  }

  return (
    <>
      <FitnessApp
        cloudSession={cloudSession}
        account={{
          displayName: membership.display_name,
          onOpen: () => setAccountOpen(true),
        }}
      />
      {accountOpen && (
        <AccountSheet
          session={cloudSession}
          onClose={() => setAccountOpen(false)}
          onOpenAdmin={() => setAccountOpen(false)}
          onSignOut={() => void client.auth.signOut()}
        />
      )}
    </>
  );
}

function CloudLoading() {
  return (
    <main className="cloud-state-shell" role="status" aria-live="polite">
      <Barbell size={38} weight="duotone" />
      <strong>正在连接私人档案</strong>
      <p>训练数据只会载入当前账号。</p>
    </main>
  );
}

function MemberAccess({ client }: { client: NonNullable<ReturnType<typeof getSupabaseClient>> }) {
  const [mode, setMode] = useState<LoginMode>("redeem");
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function changeMode(nextMode: LoginMode) {
    setMode(nextMode);
    setPin("");
    setConfirmPin("");
    setError("");
  }

  function validateCredentials(requireConfirmation: boolean) {
    const normalized = normalizeMemberLoginId(loginId);
    if (!/^WL[A-HJ-NP-Z2-9]{8}$/.test(normalized)) {
      return "请输入管理员提供的完整邀请码。";
    }
    return pinValidationMessage(pin, requireConfirmation ? confirmPin : undefined);
  }

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateCredentials(true);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError("");
    const { data, error: functionError } = await client.functions.invoke("redeem-invite-code", {
      body: { code: formatMemberLoginId(loginId), pin },
    });
    if (functionError) {
      setBusy(false);
      setError(await functionErrorMessage(functionError, "邀请码激活失败，请稍后重试。"));
      return;
    }

    const payload = data as { accessToken?: string; refreshToken?: string } | null;
    if (!payload?.accessToken || !payload.refreshToken) {
      setBusy(false);
      setError("账号已经创建，但自动登录失败。请切换到“已有账号”重新登录。");
      return;
    }

    const { error: sessionError } = await client.auth.setSession({
      access_token: payload.accessToken,
      refresh_token: payload.refreshToken,
    });
    setBusy(false);
    if (sessionError) setError("账号已经创建，请切换到“已有账号”重新登录。");
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateCredentials(false);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError("");
    const { error: authError } = await client.auth.signInWithPassword({
      email: memberAuthEmail(loginId),
      password: memberAuthPassword(loginId, pin),
    });
    setBusy(false);
    if (authError) setError("登录号或6位密码不正确，请重新检查。");
  }

  if (mode === "admin") return <AdminLogin client={client} onBack={() => changeMode("redeem")} />;

  const redeeming = mode === "redeem";
  return (
    <main className="family-auth-shell">
      <section className="family-auth-card" aria-labelledby="family-login-title">
        <div className="family-auth-mark"><Barbell size={27} weight="duotone" /></div>
        <span>亲友私人档案</span>
        <h1 id="family-login-title">{redeeming ? "激活你的档案" : "回到稳练"}</h1>
        <p>{redeeming ? "输入管理员发给你的专属邀请码，并设置自己的6位密码。" : "使用首次激活时的邀请码和6位密码登录。"}</p>

        <div className="family-auth-switch" aria-label="亲友登录方式">
          <button type="button" className={redeeming ? "active" : ""} onClick={() => changeMode("redeem")}>首次激活</button>
          <button type="button" className={!redeeming ? "active" : ""} onClick={() => changeMode("login")}>已有账号</button>
        </div>

        <form className="family-auth-form" onSubmit={redeeming ? redeem : login}>
          <label htmlFor="family-login-id">{redeeming ? "一次性邀请码" : "登录号"}</label>
          <div className="family-auth-input">
            <Ticket size={19} />
            <input
              id="family-login-id"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="WL-XXXX-XXXX"
              maxLength={12}
              required
            />
          </div>
          <label htmlFor="family-pin">6位数字密码</label>
          <div className="family-auth-input">
            <Key size={19} />
            <input
              id="family-pin"
              type="password"
              inputMode="numeric"
              autoComplete={redeeming ? "new-password" : "current-password"}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="输入6位数字"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </div>
          {redeeming && (
            <>
              <label htmlFor="family-pin-confirm">再次输入密码</label>
              <div className="family-auth-input">
                <LockKey size={19} />
                <input
                  id="family-pin-confirm"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="再次输入6位数字"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </div>
            </>
          )}
          {error && <p className="family-auth-error" role="alert"><Warning size={17} />{error}</p>}
          <button className="family-auth-primary" type="submit" disabled={busy}>
            {busy ? (redeeming ? "正在建立档案" : "正在登录") : (redeeming ? "激活并进入" : "进入我的档案")}
          </button>
        </form>

        <div className="family-auth-device-note">
          <DeviceMobile size={19} weight="duotone" />
          <p>登录状态会保存在这部手机。邀请码首次激活后，继续作为你的登录号使用。</p>
        </div>
        <button className="family-auth-admin-link" type="button" onClick={() => changeMode("admin")}>管理员登录</button>
        <div className="family-auth-privacy">
          <LockKey size={18} weight="duotone" />
          <p>每位成员只能查看自己的身体档案和训练记录，管理员也不能读取。</p>
        </div>
      </section>
    </main>
  );
}

function AdminLogin({
  client,
  onBack,
}: {
  client: NonNullable<ReturnType<typeof getSupabaseClient>>;
  onBack: () => void;
}) {
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [email, setEmail] = useState(rememberedAdminEmail);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (recoveryOpen) {
    return <AdminMagicLinkLogin client={client} onBack={() => setRecoveryOpen(false)} />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const validationError = pinValidationMessage(pin);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError("");
    const { error: authError } = await client.auth.signInWithPassword({
      email: normalizedEmail,
      password: adminAuthPassword(normalizedEmail, pin),
    });
    setBusy(false);
    if (authError) {
      setError("邮箱或6位管理员密码不正确。首次使用请通过邮件验证后设置密码。");
      return;
    }
    window.localStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, normalizedEmail);
  }

  return (
    <main className="family-auth-shell">
      <section className="family-auth-card" aria-labelledby="admin-login-title">
        <button className="family-auth-back" type="button" onClick={onBack}><ArrowLeft size={18} />亲友登录</button>
        <div className="family-auth-mark"><Barbell size={27} weight="duotone" /></div>
        <span>管理员入口</span>
        <h1 id="admin-login-title">管理员登录</h1>
        <p>使用管理员邮箱和6位数字密码。成功一次后，这部手机会自动保持登录。</p>

        <form className="family-auth-form" onSubmit={submit}>
          <label htmlFor="admin-email">管理员邮箱</label>
          <div className="family-auth-input">
            <EnvelopeSimple size={19} />
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="管理员邮箱"
              required
            />
          </div>
          <label htmlFor="admin-pin">6位数字密码</label>
          <div className="family-auth-input">
            <Key size={19} />
            <input
              id="admin-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="输入6位数字"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </div>
          {error && <p className="family-auth-error" role="alert"><Warning size={17} />{error}</p>}
          <button className="family-auth-primary" type="submit" disabled={busy}>
            {busy ? "正在登录" : "进入管理员账号"}
          </button>
        </form>

        <div className="family-auth-device-note">
          <DeviceMobile size={19} weight="duotone" />
          <p>请固定从iPhone主屏幕的“稳练”图标进入，不要在微信、Gmail和Safari之间切换入口。</p>
        </div>
        <button className="family-auth-admin-link" type="button" onClick={() => setRecoveryOpen(true)}>首次设置或忘记密码？使用邮件验证</button>
      </section>
    </main>
  );
}

function AdminMagicLinkLogin({
  client,
  onBack,
}: {
  client: NonNullable<ReturnType<typeof getSupabaseClient>>;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(readAuthCallbackError);

  useEffect(() => {
    if (!error || typeof window === "undefined") return;
    const callbackParams = `${window.location.search}${window.location.hash}`;
    if (!callbackParams.includes("error")) return;
    window.history.replaceState({}, document.title, window.location.pathname);
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error: authError } = await client.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    setSending(false);
    if (authError) {
      setError(formatAuthSendError(authError));
      return;
    }
    setSent(true);
  }

  return (
    <main className="family-auth-shell">
      <section className="family-auth-card" aria-labelledby="family-login-title">
        <button className="family-auth-back" type="button" onClick={onBack}><ArrowLeft size={18} />密码登录</button>
        <div className="family-auth-mark"><Barbell size={27} weight="duotone" /></div>
        <span>管理员入口</span>
        <h1 id="family-login-title">邮件恢复</h1>
        <p>首次设置6位密码或忘记密码时使用。日常登录不需要发送邮件。</p>

        {sent ? (
          <div className="family-auth-success" role="status">
            <CheckCircle size={24} weight="fill" />
            <div>
              <strong>登录邮件已发送</strong>
              <p>请在这部 iPhone 上打开邮件中的链接。</p>
            </div>
          </div>
        ) : (
          <form className="family-auth-form" onSubmit={submit}>
            <label htmlFor="family-email">邮箱</label>
            <div className="family-auth-input">
              <EnvelopeSimple size={19} />
              <input
                id="family-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="收到邀请的邮箱"
                required
              />
            </div>
            {error && <p className="family-auth-error" role="alert"><Warning size={17} />{error}</p>}
            <button className="family-auth-primary" type="submit" disabled={sending}>
              {sending ? "正在发送" : "发送登录链接"}
            </button>
          </form>
        )}

        <div className="family-auth-privacy">
          <LockKey size={18} weight="duotone" />
          <p>邮箱入口仅用于管理员账号和历史账号维护。</p>
        </div>
      </section>
    </main>
  );
}

async function functionErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) return payload.error;
      } catch {
        // Fall through to the public error message.
      }
    }
  }
  if (error instanceof Error && error.message && !error.message.includes("non-2xx")) return error.message;
  return fallback;
}

function readAuthCallbackError() {
  if (typeof window === "undefined") return "";
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = hash.get("error_code") ?? query.get("error_code") ?? "";
  const description = hash.get("error_description") ?? query.get("error_description") ?? "";
  const detail = `${code} ${description}`.toLowerCase();

  if (!detail.trim()) return "";
  if (detail.includes("expired") || detail.includes("otp_expired")) {
    return "登录链接已失效或已被使用，请重新发送一封新邮件。";
  }
  if (detail.includes("code verifier") || detail.includes("flow_state") || detail.includes("pkce")) {
    return "这封登录邮件来自旧的浏览器验证流程，请重新发送一封新邮件。";
  }
  return "登录链接验证失败，请重新发送一封新邮件。";
}

function formatAuthSendError(authError: { code?: string; message?: string; status?: number }) {
  const detail = `${authError.code ?? ""} ${authError.message ?? ""}`.toLowerCase();
  if (detail.includes("over_email_send_rate_limit")) {
    return "邮件发送次数已达当前服务上限，请稍后再试。";
  }
  if (authError.status === 429 || detail.includes("rate limit") || detail.includes("rate_limit")) {
    return "发送太频繁，请等待 60 秒后再试。";
  }
  if (detail.includes("otp_disabled")) {
    return "邮件登录暂未启用，请联系管理员。";
  }
  return "这个邮箱还没有收到邀请，或登录邮件暂时发送失败。";
}

function AccessBlocked({ email, onRetry, onSignOut }: { email: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <main className="cloud-state-shell">
      <LockKey size={36} weight="duotone" />
      <strong>账号尚未启用</strong>
      <p>{email || "当前账号"} 还没有有效的亲友权限，请联系管理员。</p>
      <button className="family-auth-primary" type="button" onClick={onRetry}>重新检查</button>
      <button className="family-auth-ghost" type="button" onClick={onSignOut}>退出账号</button>
    </main>
  );
}

function CloudError({ onRetry, onSignOut }: { onRetry: () => void; onSignOut: () => void }) {
  return (
    <main className="cloud-state-shell">
      <Warning size={36} weight="duotone" />
      <strong>暂时无法读取档案</strong>
      <p>本机记录没有被删除，请检查网络后重试。</p>
      <button className="family-auth-primary" type="button" onClick={onRetry}>重新连接</button>
      <button className="family-auth-ghost" type="button" onClick={onSignOut}>退出账号</button>
    </main>
  );
}

function AccountSheet({
  session,
  onClose,
  onOpenAdmin,
  onSignOut,
}: {
  session: CloudSession;
  onClose: () => void;
  onOpenAdmin: () => void;
  onSignOut: () => void;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinMessage, setPinMessage] = useState("");

  async function saveAdminPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = pinValidationMessage(pin, confirmPin);
    if (validationError) {
      setPinMessage(validationError);
      return;
    }

    setPinBusy(true);
    setPinMessage("");
    const { error } = await session.client.auth.updateUser({
      password: adminAuthPassword(session.email, pin),
    });
    setPinBusy(false);
    if (error) {
      setPinMessage("密码保存失败，请重新登录后再试。");
      return;
    }
    setPin("");
    setConfirmPin("");
    setPinMessage("6位管理员密码已保存，今后无需邮件即可登录。");
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="account-sheet" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className="sheet-close" type="button" onClick={onClose} aria-label="关闭账号设置"><X size={21} /></button>
        <UserCircle size={36} weight="duotone" />
        <span>当前账号</span>
        <h2 id="account-title">{session.membership.display_name}</h2>
        <p>{session.membership.login_id ? `登录号 ${session.membership.login_id}` : session.email}</p>
        <div className="account-sync-note"><CheckCircle size={18} weight="fill" />个人档案已启用云端隔离</div>
        {session.membership.role === "admin" && (
          <>
            <button className="account-action" type="button" onClick={() => { setPinOpen((open) => !open); setPinMessage(""); }}>
              <Key size={19} />{pinOpen ? "收起密码设置" : "设置或更换6位管理员密码"}
            </button>
            {pinOpen && (
              <form className="account-pin-panel" onSubmit={saveAdminPin}>
                <label htmlFor="account-admin-pin">新6位密码</label>
                <input
                  id="account-admin-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
                <label htmlFor="account-admin-pin-confirm">再次输入</label>
                <input
                  id="account-admin-pin-confirm"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
                {pinMessage && <p role="status">{pinMessage}</p>}
                <button className="family-auth-primary" type="submit" disabled={pinBusy}>{pinBusy ? "正在保存" : "保存管理员密码"}</button>
              </form>
            )}
            <a
              className="account-action"
              href="./admin.html"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onOpenAdmin}
            >
              <UsersThree size={19} />管理亲友账号
            </a>
          </>
        )}
        <button className="account-action is-danger" type="button" onClick={onSignOut}>
          <SignOut size={19} />退出账号
        </button>
      </section>
    </div>
  );
}

function AdminPanel({ session, onClose }: { session: CloudSession; onClose: () => void }) {
  const [members, setMembers] = useState<Membership[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCodeSummary[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [generatedInvite, setGeneratedInvite] = useState<GeneratedInvite | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const [memberResult, inviteResult] = await Promise.all([
      session.client
        .from("memberships")
        .select("user_id,email,login_id,auth_method,display_name,role,status,created_at,updated_at")
        .order("created_at", { ascending: true }),
      session.client
        .from("invite_codes")
        .select("id,display_name,code_hint,status,expires_at,created_at")
        .in("status", ["pending", "claiming"])
        .order("created_at", { ascending: false }),
    ]);
    setLoading(false);
    const error = memberResult.error ?? inviteResult.error;
    if (error) setMessage("成员列表读取失败");
    else {
      setMembers((memberResult.data ?? []) as Membership[]);
      setInviteCodes((inviteResult.data ?? []) as InviteCodeSummary[]);
    }
  }, [session.client]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setGeneratedInvite(null);
    const { data, error } = await session.client.functions.invoke("create-invite-code", {
      body: { displayName: displayName.trim() },
    });
    setSaving(false);
    if (error) {
      setMessage(await functionErrorMessage(error, "邀请码生成失败"));
      return;
    }
    const payload = data as GeneratedInvite | null;
    if (!payload?.code) {
      setMessage("邀请码生成失败");
      return;
    }
    setDisplayName("");
    setGeneratedInvite(payload);
    setMessage("邀请码已生成，请立即复制给本人");
    void loadMembers();
  }

  async function copyInviteCode() {
    if (!generatedInvite) return;
    await navigator.clipboard.writeText(generatedInvite.code);
    setMessage("邀请码已复制");
  }

  async function updateStatus(member: Membership, status: MemberStatus) {
    setMessage("");
    const { error } = await session.client.functions.invoke("update-member-status", {
      body: { userId: member.user_id, status },
    });
    if (error) setMessage(error.message || "成员状态更新失败");
    else void loadMembers();
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <button type="button" onClick={onClose} aria-label="返回稳练"><ArrowLeft size={22} /></button>
        <div><span>亲友账号</span><h1>成员管理</h1></div>
      </header>

      <section className="admin-privacy-note">
        <LockKey size={21} weight="duotone" />
        <p>这里仅显示账号状态，不提供身体档案或训练记录入口。</p>
      </section>

      <section className="admin-invite-card">
        <div className="admin-section-heading"><div><span>一次性激活</span><h2>生成亲友邀请码</h2></div><Ticket size={25} weight="duotone" /></div>
        <form onSubmit={createInvite}>
          <label>称呼<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} required /></label>
          <button className="family-auth-primary" type="submit" disabled={saving}>{saving ? "正在生成" : "生成邀请码"}</button>
        </form>
        {generatedInvite && (
          <div className="generated-invite" role="status">
            <span>{generatedInvite.displayName}的专属邀请码</span>
            <strong>{generatedInvite.code}</strong>
            <p>7天内首次激活有效。激活后，它会继续作为该成员的登录号。</p>
            <button type="button" onClick={() => void copyInviteCode()}><Copy size={18} />复制邀请码</button>
          </div>
        )}
        {message && <p className="admin-message" role="status">{message}</p>}
      </section>

      {inviteCodes.length > 0 && (
        <section className="admin-pending-codes" aria-labelledby="pending-codes-title">
          <div><h2 id="pending-codes-title">等待激活</h2><span>{inviteCodes.length} 个</span></div>
          {inviteCodes.map((invite) => (
            <article key={invite.id}>
              <div><strong>{invite.display_name}</strong><small>邀请码尾号 · {invite.code_hint}</small></div>
              <span>{new Date(invite.expires_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} 到期</span>
            </article>
          ))}
        </section>
      )}

      <section className="admin-members" aria-labelledby="members-title">
        <div><h2 id="members-title">已加入成员</h2><span>{members.length} 人</span></div>
        {loading ? (
          <p className="admin-empty">正在读取成员</p>
        ) : members.length === 0 ? (
          <p className="admin-empty">还没有亲友账号</p>
        ) : (
          members.map((member) => (
            <article key={member.user_id}>
              <div>
                <strong>{member.display_name}</strong>
                <small>{member.login_id ? `登录号 · ${member.login_id}` : member.email}</small>
              </div>
              {member.role === "admin" ? (
                <span className="member-role">管理员</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void updateStatus(member, member.status === "active" ? "disabled" : "active")}
                >
                  {member.status === "active" ? "停用" : "恢复"}
                </button>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
