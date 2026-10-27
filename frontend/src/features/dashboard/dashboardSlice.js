import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchDashboardData } from "../../api/endpoints";

export const fetchDashboard = createAsyncThunk(
  "dashboard/fetch",
  async (options = {}, { rejectWithValue }) => {
    try {
      const data = await fetchDashboardData();
      return { data, isSilent: Boolean(options.silent) };
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState: {
    data: null,
    status: "idle", // idle | loading | succeeded | failed
    error: null,
    lastFetchedAt: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state, action) => {
        // Only set loading if not silent background refresh
        if (!action.meta.arg?.silent && !state.data) {
          state.status = "loading";
        }
        state.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload.data;
        state.lastFetchedAt = new Date().toISOString();
        state.error = null;
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload;
      });
  },
});

export default dashboardSlice.reducer;
