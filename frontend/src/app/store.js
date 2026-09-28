import { configureStore } from "@reduxjs/toolkit";
import dashboardReducer from "../features/dashboard/dashboardSlice";
import quarantineReducer from "../features/quarantine/quarantineSlice";
import auditReducer from "../features/audit/auditSlice";

export const store = configureStore({
  reducer: {
    dashboard: dashboardReducer,
    quarantine: quarantineReducer,
    audit: auditReducer,
  },
});
