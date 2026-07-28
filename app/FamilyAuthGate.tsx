"use client";

import {
  ArrowLeft,
  Barbell,
  CheckCircle,
  EnvelopeSimple,
  LockKey,
  SignOut,
  UserCircle,
  UsersThree,
  Warning,
  X,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import FitnessApp from "./FitnessApp";
import { getSupabaseClient } from "./cloud/client";
import type { CloudSession, Membership, MemberStatus } from "./cloud/client";

type AuthState = "loading" | "signed-out" | "checking" | "active" | "blocked" | "error";

export default function FamilyAuthGate() {
  const client = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [state, setState] = useState<AuthState>(client ? "loading" : "active");
  const [accountOpen, setAccountOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const loadMembership = useCallback(async (nextSession: Session) => {
    if (!client) return;
    setState("checking");
    const { data, error } = await client
      .from("memberships")
      .select("user_id,email,display_name,role,status,created_at,updated_at")
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

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setMembership(null);
      setAccountOpen(false);
      setAdminOpen(false);
      if (nextSession) void loadMembership(nextSession);
      else setState("signed-out");
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [client, loadMembership]);

  if (!client) return <FitnessApp />;
  if (state === "loading" || state === "checking") return <CloudLoading />;
  if (state === "signed-out") return <MagicLinkLogin client={client} />;

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
          onOpenAdmin={() => {
            setAccountOpen(false);
            setAdminOpen(true);
          }}
          onSignOut={() => void client.auth.signOut()}
        />
      )}
      {adminOpen && membership.role === "admin" && (
        <AdminPanel session={cloudSession} onClose={() => setAdminOpen(false)} />
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

function MagicLinkLogin({ client }: { client: NonNullable<ReturnType<typeof getSupabaseClient>> }) {
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
        <div className="family-auth-mark"><Barbell size={27} weight="duotone" /></div>
        <span>亲友私人档案</span>
        <h1 id="family-login-title">登录稳练</h1>
        <p>仅限收到邀请的亲友。登录链接会发送到你的邮箱，不需要记密码。</p>

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
          <p>每位成员只能查看自己的身体档案和训练记录，管理员也不能读取。</p>
        </div>
      </section>
    </main>
  );
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
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="account-sheet" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className="sheet-close" type="button" onClick={onClose} aria-label="关闭账号设置"><X size={21} /></button>
        <UserCircle size={36} weight="duotone" />
        <span>当前账号</span>
        <h2 id="account-title">{session.membership.display_name}</h2>
        <p>{session.email}</p>
        <div className="account-sync-note"><CheckCircle size={18} weight="fill" />个人档案已启用云端隔离</div>
        {session.membership.role === "admin" && (
          <button className="account-action" type="button" onClick={onOpenAdmin}>
            <UsersThree size={19} />管理亲友账号
          </button>
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
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await session.client
      .from("memberships")
      .select("user_id,email,display_name,role,status,created_at,updated_at")
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) setMessage("成员列表读取失败");
    else setMembers((data ?? []) as Membership[]);
  }, [session.client]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const { error } = await session.client.functions.invoke("invite-member", {
      body: { email: email.trim(), displayName: displayName.trim() },
    });
    setSaving(false);
    if (error) {
      setMessage(error.message || "邀请发送失败");
      return;
    }
    setEmail("");
    setDisplayName("");
    setMessage("邀请邮件已发送");
    void loadMembers();
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
        <h2>邀请亲友</h2>
        <form onSubmit={invite}>
          <label>称呼<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} required /></label>
          <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <button className="family-auth-primary" type="submit" disabled={saving}>{saving ? "正在发送" : "发送邀请"}</button>
        </form>
        {message && <p className="admin-message" role="status">{message}</p>}
      </section>

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
                <small>{member.email}</small>
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
