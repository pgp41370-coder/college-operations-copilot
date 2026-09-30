"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogOut, UserPlus } from "lucide-react";
import { api, errorText } from "@/components/client-api";
import { Badge, Button, Modal, Notice } from "@/components/ui";

export function SignOut() {
  const router = useRouter();
  return (
    <Button
      size="sm"
      icon={LogOut}
      onClick={async () => {
        await api("/api/auth/logout", { body: {} }).catch(() => {});
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}

export function PasswordForm() {
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setBusy(true);
        try {
          await api("/api/account/password", { body: { currentPassword: f.get("current"), newPassword: f.get("next") } });
          setMsg({ tone: "success", text: "Password changed." });
          form.reset();
        } catch (err) {
          setMsg({ tone: "error", text: errorText(err) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="pw-current">Current password</label>
        <input id="pw-current" className="input" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="pw-next">New password</label>
        <input id="pw-next" className="input" name="next" type="password" autoComplete="new-password" minLength={10} required />
        <p className="help">At least 10 characters.</p>
      </div>
      <Button type="submit" size="sm" icon={KeyRound} loading={busy} disabled={busy}>
        Change password
      </Button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </form>
  );
}

type U = { id: string; email: string; name: string; role: string; is_active: boolean };

export function UserAdmin({ users, selfId }: { users: U[]; selfId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [reset, setReset] = useState<U | null>(null);
  const [pw, setPw] = useState("");
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg({ tone: "success", text: ok });
      router.refresh();
      return true;
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e) });
      return false;
    }
  };
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}{u.id === selfId && <span className="t-meta"> (you)</span>}</td>
                <td className="text-fg-2">{u.email}</td>
                <td><Badge tone={u.role === "admin" ? "brand" : "neutral"}>{u.role}</Badge></td>
                <td>{u.is_active ? <Badge tone="success" dot>Active</Badge> : <Badge tone="danger" dot>Deactivated</Badge>}</td>
                <td className="whitespace-nowrap text-right">
                  {u.id !== selfId && (
                    <span className="inline-flex gap-1.5">
                      <Button size="sm" onClick={() => run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { isActive: !u.is_active } }), "User updated.")}>
                        {u.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button size="sm" onClick={() => { setPw(""); setReset(u); }}>
                        Reset password
                      </Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="grid gap-2 rounded-lg border border-dashed border-line-strong p-3 md:grid-cols-[1fr_1fr_130px_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          if (await run(() => api("/api/admin/users", { body: { name: f.get("name"), email: f.get("email"), role: f.get("role"), password: f.get("password") } }), "User created. Share the temporary password privately.")) form.reset();
        }}
      >
        <input className="input" name="name" placeholder="Full name" aria-label="Full name" required />
        <input className="input" name="email" type="email" placeholder="Email" aria-label="Email" required />
        <select className="input" name="role" defaultValue="faculty" aria-label="Role">
          <option value="faculty">Faculty</option>
          <option value="admin">Admin</option>
        </select>
        <input className="input" name="password" type="password" placeholder="Temporary password" aria-label="Temporary password" minLength={10} autoComplete="new-password" required />
        <Button type="submit" variant="primary" icon={UserPlus}>Add user</Button>
      </form>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Modal
        open={!!reset}
        onClose={() => setReset(null)}
        title="Reset password"
        footer={
          <>
            <Button onClick={() => setReset(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={pw.length < 10}
              onClick={async () => {
                const u = reset!;
                if (await run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { password: pw } }), "Password reset. Existing sessions were signed out.")) setReset(null);
                setPw("");
              }}
            >
              Reset password
            </Button>
          </>
        }
      >
        <label className="label" htmlFor="reset-pw">New temporary password for {reset?.email}</label>
        <input id="reset-pw" className="input" type="password" autoComplete="new-password" minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} />
        <p className="help">At least 10 characters. Share it with the user privately.</p>
      </Modal>
    </div>
  );
}
