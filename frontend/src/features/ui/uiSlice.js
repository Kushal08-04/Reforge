import { createSlice } from "@reduxjs/toolkit";
import { getDataMode, setDataMode } from "../../api/endpoints";

function getInitialTheme() {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem("reforge_theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const uiSlice = createSlice({
  name: "ui",
  initialState: {
    theme: getInitialTheme(),
    sidebarCollapsed: typeof window !== "undefined" ? localStorage.getItem("reforge_sidebar_collapsed") === "true" : false,
    dataMode: getDataMode(),
    pollingInterval: 10000, // 10 seconds default auto-refresh in Live Mode
    tourOpen: false,
    currentTourStep: 0,
  },
  reducers: {
    toggleTheme(state) {
      state.theme = state.theme === "dark" ? "light" : "dark";
      if (typeof window !== "undefined") {
        localStorage.setItem("reforge_theme", state.theme);
        document.documentElement.setAttribute("data-theme", state.theme);
      }
    },
    setTheme(state, action) {
      state.theme = action.payload;
      if (typeof window !== "undefined") {
        localStorage.setItem("reforge_theme", action.payload);
        document.documentElement.setAttribute("data-theme", action.payload);
      }
    },
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      if (typeof window !== "undefined") {
        localStorage.setItem("reforge_sidebar_collapsed", state.sidebarCollapsed);
      }
    },
    switchDataMode(state, action) {
      state.dataMode = action.payload;
      setDataMode(action.payload);
    },
    setPollingInterval(state, action) {
      state.pollingInterval = action.payload;
    },
    openTour(state) {
      state.tourOpen = true;
      state.currentTourStep = 0;
    },
    closeTour(state) {
      state.tourOpen = false;
    },
    setTourStep(state, action) {
      state.currentTourStep = action.payload;
    },
  },
});

export const {
  toggleTheme,
  setTheme,
  toggleSidebar,
  switchDataMode,
  setPollingInterval,
  openTour,
  closeTour,
  setTourStep,
} = uiSlice.actions;

export default uiSlice.reducer;
