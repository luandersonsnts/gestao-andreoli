import MenuIcon from "@mui/icons-material/Menu";
import { AppBar, Box, Button, Container, IconButton, Menu, MenuItem, Toolbar, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ClientsPage } from "./pages/ClientsPage";
import { ClientFormPage } from "./pages/ClientFormPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { UsersPage } from "./pages/UsersPage";
import { AutomationPage } from "./pages/AutomationPage";
import logo from "./assets/andreoli-logo.svg";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") return null;
  if (state.status === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const role = state.status === "authenticated" ? state.user.role : null;

  const menuItems = useMemo(() => {
    const items: Array<{ label: string; to?: string; action?: "logout" }> = [
      { label: "Dashboard", to: "/" },
      { label: "Clientes", to: "/clients" },
      { label: "Alertas", to: "/notifications" }
    ];
    if (state.status === "authenticated") {
      items.push({ label: "Automação", to: "/automation" });
    }
    if (state.status === "authenticated" && state.user.role === "ADMIN") {
      items.push({ label: "Usuários", to: "/users" });
    }
    if (state.status === "authenticated") {
      items.push({ label: "Sair", action: "logout" });
    }
    return items;
  }, [state.status, role]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexGrow: 1 }}>
            <Box component="img" src={logo} alt="Andreoli Consultoria" sx={{ width: 34, height: 34 }} />
            <Typography variant="h6" noWrap sx={{ fontSize: { xs: 16, sm: 20 } }}>
              Andreoli Consultoria
            </Typography>
          </Box>
          {isMobile ? (
            <>
              <IconButton color="inherit" onClick={(e) => setMenuAnchor(e.currentTarget)}>
                <MenuIcon />
              </IconButton>
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                {menuItems.map((i) => (
                  <MenuItem
                    key={i.label}
                    onClick={() => {
                      setMenuAnchor(null);
                      if (i.action === "logout") return logout();
                      if (i.to) navigate(i.to);
                    }}
                  >
                    {i.label}
                  </MenuItem>
                ))}
              </Menu>
            </>
          ) : (
            <>
              <Button color="inherit" onClick={() => navigate("/")}>
                Dashboard
              </Button>
              <Button color="inherit" onClick={() => navigate("/clients")}>
                Clientes
              </Button>
              <Button color="inherit" onClick={() => navigate("/notifications")}>
                Alertas
              </Button>
              {state.status === "authenticated" ? (
                <Button color="inherit" onClick={() => navigate("/automation")}>
                  Automação
                </Button>
              ) : null}
              {state.status === "authenticated" && state.user.role === "ADMIN" ? (
                <Button color="inherit" onClick={() => navigate("/users")}>
                  Usuários
                </Button>
              ) : null}
              {state.status === "authenticated" ? (
                <Button color="inherit" onClick={logout}>
                  Sair
                </Button>
              ) : null}
            </>
          )}
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 3 }}>{children}</Container>
    </Box>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Shell>
              <DashboardPage />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/clients"
        element={
          <RequireAuth>
            <Shell>
              <ClientsPage />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/clients/new"
        element={
          <RequireAuth>
            <Shell>
              <ClientFormPage mode="create" />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/clients/:id"
        element={
          <RequireAuth>
            <Shell>
              <ClientFormPage mode="edit" />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/notifications"
        element={
          <RequireAuth>
            <Shell>
              <NotificationsPage />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/users"
        element={
          <RequireAuth>
            <Shell>
              <UsersPage />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/automation"
        element={
          <RequireAuth>
            <Shell>
              <AutomationPage />
            </Shell>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
