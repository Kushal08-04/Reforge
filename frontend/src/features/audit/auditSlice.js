import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchAuditTrail as apiFetchAuditTrail } from "../../api/endpoints";

export const fetchAuditTrail = createAsyncThunk(
  "audit/fetch",
  async (rawObservationId, { rejectWithValue }) => {
    try {
      const data = await apiFetchAuditTrail(rawObservationId);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

const auditSlice = createSlice({
  name: "audit",
  initialState: {
    data: null,
    status: "idle",
    error: null,
  },
  reducers: {
    clearAudit(state) {
      state.data = null;
      state.status = "idle";
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuditTrail.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchAuditTrail.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload;
      })
      .addCase(fetchAuditTrail.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload;
      });
  },
});

export const { clearAudit } = auditSlice.actions;
export default auditSlice.reducer;
