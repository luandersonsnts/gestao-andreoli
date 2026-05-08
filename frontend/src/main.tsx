import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { App } from "./App";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#ffffff" },
    secondary: { main: "#9e9e9e" },
    background: { default: "#000000", paper: "#0f0f0f" },
    text: { primary: "#ffffff", secondary: "#bdbdbd" }
  },
  shape: { borderRadius: 12 },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#000000"
        }
      }
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
