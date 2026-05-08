import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import { createUser, listUsers, resetUserPassword, updateUser } from "../api/api";
import type { UserListItem } from "../api/types";
import { useAuth } from "../auth/AuthContext";

type Role = "ADMIN" | "COMERCIAL" | "LEITURA";

export function UsersPage() {
  const { state } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [role, setRole] = useState<Role>("COMERCIAL");
  const [password, setPassword] = useState("");

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const canAccess = useMemo(() => state.status === "authenticated" && state.user.role === "ADMIN", [state]);

  const refresh = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await listUsers();
      setUsers(r.users);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar usuários");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      await createUser({
        email,
        password,
        nome: nome ? nome : null,
        role
      });
      setEmail("");
      setNome("");
      setRole("COMERCIAL");
      setPassword("");
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao criar usuário");
    } finally {
      setBusy(false);
    }
  };

  const onToggleActive = async (u: UserListItem) => {
    setError(null);
    try {
      await updateUser(u.id, { active: !u.active });
      setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, active: !u.active } : p)));
    } catch (e: any) {
      setError(e?.message ?? "Falha ao atualizar usuário");
    }
  };

  const onChangeRole = async (u: UserListItem, newRole: Role) => {
    setError(null);
    try {
      await updateUser(u.id, { role: newRole });
      setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, role: newRole } : p)));
    } catch (e: any) {
      setError(e?.message ?? "Falha ao atualizar usuário");
    }
  };

  const onResetPassword = async () => {
    if (!resetUserId) return;
    setError(null);
    setBusy(true);
    try {
      await resetUserPassword(resetUserId, resetPassword);
      setResetUserId(null);
      setResetPassword("");
    } catch (e: any) {
      setError(e?.message ?? "Falha ao redefinir senha");
    } finally {
      setBusy(false);
    }
  };

  if (!canAccess) {
    return (
      <Alert severity="warning">
        Esta área é restrita ao perfil ADMIN.
      </Alert>
    );
  }

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography variant="h5">Usuários e Permissões</Typography>
      </Grid>

      <Grid item xs={12}>
        {error ? <Alert severity="error">{error}</Alert> : null}
      </Grid>

      <Grid item xs={12} md={5}>
        <Card>
          <CardContent sx={{ display: "grid", gap: 2 }}>
            <Typography variant="h6">Criar usuário</Typography>
            <TextField label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
            <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} fullWidth />

            <FormControl fullWidth>
              <InputLabel id="role-label">Perfil</InputLabel>
              <Select labelId="role-label" label="Perfil" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <MenuItem value="ADMIN">ADMIN (total)</MenuItem>
                <MenuItem value="COMERCIAL">COMERCIAL (cadastrar/editar)</MenuItem>
                <MenuItem value="LEITURA">LEITURA (somente ver)</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Senha (mín. 8)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              fullWidth
            />

            <Button variant="contained" onClick={onCreate} disabled={busy || !email || password.length < 8}>
              Criar
            </Button>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={7}>
        <Card>
          <CardContent>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ sm: "center" }}
              gap={1}
              sx={{ mb: 1 }}
            >
              <Typography variant="h6">Lista</Typography>
              <Button onClick={refresh} disabled={busy} sx={{ width: { xs: "100%", sm: "auto" } }}>
                Atualizar
              </Button>
            </Stack>

            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 760 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Nome</TableCell>
                    <TableCell>E-mail</TableCell>
                    <TableCell>Perfil</TableCell>
                    <TableCell>Ativo</TableCell>
                    <TableCell>Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.nome ?? "-"}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          value={u.role}
                          onChange={(e) => onChangeRole(u, e.target.value as Role)}
                          disabled={busy}
                        >
                          <MenuItem value="ADMIN">ADMIN</MenuItem>
                          <MenuItem value="COMERCIAL">COMERCIAL</MenuItem>
                          <MenuItem value="LEITURA">LEITURA</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch checked={u.active} onChange={() => onToggleActive(u)} disabled={busy} />
                      </TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => setResetUserId(u.id)} disabled={busy}>
                          Redefinir senha
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          Nenhum usuário encontrado.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Dialog open={Boolean(resetUserId)} onClose={() => (busy ? null : setResetUserId(null))} fullWidth maxWidth="sm">
        <DialogTitle>Redefinir senha</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField
            label="Nova senha (mín. 8)"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            type="password"
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetUserId(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={onResetPassword} disabled={busy || resetPassword.length < 8}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  );
}
