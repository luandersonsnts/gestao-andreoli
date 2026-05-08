import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { bootstrap, login, resetPassword } from "../api/api";
import type { ApiError } from "../api/http";
import { useAuth } from "../auth/AuthContext";
import logo from "../assets/andreoli-logo.svg";

type Mode = "login" | "bootstrap";

export function LoginPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const redirectTo = useMemo(() => (typeof location?.state?.from === "string" ? location.state.from : "/"), [location]);

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem("remember_me") === "1");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");

  useEffect(() => {
    const remembered = localStorage.getItem("remember_email");
    if (remembered) setEmail(remembered);
  }, []);

  useEffect(() => {
    if (!rememberMe) {
      localStorage.removeItem("remember_me");
      localStorage.removeItem("remember_email");
      return;
    }
    localStorage.setItem("remember_me", "1");
    if (email) localStorage.setItem("remember_email", email);
  }, [rememberMe, email]);

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = mode === "login" ? await login(email, password) : await bootstrap(email, password, nome || undefined);
      setSession(r.token, r.user, { persist: mode === "login" ? rememberMe : true });
      navigate(redirectTo, { replace: true });
    } catch (e) {
      const err = e as ApiError;
      setError(err.message ?? "Falha ao entrar");
    } finally {
      setBusy(false);
    }
  };

  const onForgot = async () => {
    setError(null);
    setBusy(true);
    try {
      await resetPassword(forgotEmail, forgotCode, forgotPassword);
      setForgotOpen(false);
      setForgotEmail("");
      setForgotCode("");
      setForgotPassword("");
      setError("Senha atualizada. Faça login.");
    } catch (e) {
      const err = e as ApiError;
      setError(err.message ?? "Falha ao redefinir senha");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 2 }}>
      <Card sx={{ width: "100%", maxWidth: 520 }}>
        <CardContent sx={{ display: "grid", gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box component="img" src={logo} alt="Andreoli Consultoria" sx={{ width: 60, height: 60 }} />
            <Box>
              <Typography variant="h5">Andreoli Consultoria</Typography>
              <Typography variant="body2" color="text.secondary">
                Gestão de clientes e cotas
              </Typography>
            </Box>
          </Box>

          <Tabs value={mode} onChange={(_, v) => setMode(v)} variant="fullWidth">
            <Tab value="login" label="Login" />
            <Tab value="bootstrap" label="Primeiro acesso" />
          </Tabs>

          {mode === "bootstrap" ? (
            <TextField label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} fullWidth />
          ) : null}
          <TextField
            label="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            fullWidth
            onKeyDown={(e) => {
              if (e.key === "Enter" && email && password && !busy) void onSubmit();
            }}
          />
          <TextField
            label="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            fullWidth
            onKeyDown={(e) => {
              if (e.key === "Enter" && email && password && !busy) void onSubmit();
            }}
          />

          {mode === "login" ? (
            <FormControlLabel
              control={<Checkbox checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />}
              label="Memorizar acesso"
            />
          ) : null}

          {error ? (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          ) : null}

          <Button variant="contained" onClick={onSubmit} disabled={busy || !email || !password}>
            {mode === "login" ? "Entrar" : "Criar usuário"}
          </Button>

          {mode === "login" ? (
            <Button
              variant="text"
              onClick={() => {
                setForgotEmail(email);
                setForgotOpen(true);
              }}
              disabled={busy}
            >
              Esqueci minha senha
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={forgotOpen} onClose={() => (busy ? null : setForgotOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle>Recuperar senha</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Use o código de recuperação definido no servidor.
          </Typography>
          <TextField
            label="E-mail"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            type="email"
            fullWidth
          />
          <TextField label="Código" value={forgotCode} onChange={(e) => setForgotCode(e.target.value)} fullWidth />
          <TextField
            label="Nova senha (mín. 8)"
            value={forgotPassword}
            onChange={(e) => setForgotPassword(e.target.value)}
            type="password"
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForgotOpen(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={onForgot}
            disabled={busy || !forgotEmail || !forgotCode || forgotPassword.length < 8}
          >
            Redefinir
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
