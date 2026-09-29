"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorText } from "@/components/client-api";
import { Badge, Notice } from "@/components/ui";

export function SignOut() {
  const router = useRouter();
  return (
    <button
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        await api("/api/auth/logout", { body: {} }).catch(() => {});
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

export function PasswordForm() {
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        try {
          await api("/api/account/password", { body: { currentPassword: f.get("current"), newPassword: f.get("next") } });
          setMsg({ tone: "success", text: "Password changed." });
          form.reset();
        } catch (err) {
          setMsg({ tone: "error", text: errorText(err) });
        }
      }}
    >
      <input className="input" name="current" type="password" placeholder="Current password" autoComplete="current-password" required />
      <input className="input" name="next" type="password" placeholder="New password (min. 10 characters)" autoComplete="new-password" minLength={10} required />
      <button className="btn btn-secondary btn-sm">Change password</button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </form>
  );
}

type U = { id: string; email: string; name: string; role: string; is_active: boolean };

export function UserAdmin({ users, selfId }: { users: U[]; selfId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg({ tone: "success", text: ok });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "error", text: errorText(e) });
    }
  };
  return (
    <div className="space-y-4">
      <table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td><Badge>{u.role}</Badge></td>
              <td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}</td>
              <td className="space-x-2 text-right">
                {u.id !== selfId && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { isActive: !u.is_active } }), "User updated.")}>{u.is_active ? "Deactivate" : "Activate"}</button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const pw = prompt(`New temporary password for ${u.email} (min. 10 characters). Share it with the user privately.`);
                        if (pw) run(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { password: pw } }), "Password reset. Existing sessions were signed out.");
                      }}
                    >
                      Reset password
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="grid gap-2 md:grid-cols-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          await run(() => api("/api/admin/users", { body: { name: f.get("name"), email: f.get("email"), role: f.get("role"), password: f.get("password") } }), "User created. Share the temporary password privately.");
          form.reset();
        }}
      >
        <input className="input" name="name" placeholder="Full name" required />
        <input className="input" name="email" type="email" placeholder="Email" required />
        <select className="input" name="role" defaultValue="faculty"><option value="faculty">Faculty</option><option value="admin">Admin</option></select>
        <input className="input" name="password" type="password" placeholder="Temporary password" minLength={10} autoComplete="new-password" required />
        <button className="btn btn-primary">Add user</button>
      </form>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
