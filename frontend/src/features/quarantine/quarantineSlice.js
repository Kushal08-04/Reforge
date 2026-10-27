import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as api from "../../api/endpoints";

export const fetchQuarantineList = createAsyncThunk(
  "quarantine/fetchList",
  async (params = {}, { rejectWithValue }) => {
    try {
      const data = await api.fetchQuarantineRecords(params);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const fetchQuarantineDetail = createAsyncThunk(
  "quarantine/fetchDetail",
  async (id, { rejectWithValue }) => {
    try {
      const data = await api.fetchQuarantineDetail(id);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const submitReview = createAsyncThunk(
  "quarantine/review",
  async ({ id, action, correctedValues, reviewer, notes }, { rejectWithValue }) => {
    try {
      const data = await api.submitQuarantineReview({ id, action, correctedValues, reviewer, notes });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const cascadeHeal = createAsyncThunk(
  "quarantine/heal",
  async ({ tier, recordIds, quarantineRecordId, reviewer }, { rejectWithValue }) => {
    try {
      const data = await api.triggerCascadeHealing({ tier, recordIds, quarantineRecordId, reviewer });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

const quarantineSlice = createSlice({
  name: "quarantine",
  initialState: {
    list: [],
    listStatus: "idle",
    listError: null,

    detail: null,
    detailStatus: "idle",
    detailError: null,

    reviewStatus: "idle",
    reviewError: null,

    healStatus: "idle",
    healError: null,
    healResult: null,
  },
  reducers: {
    clearDetail(state) {
      state.detail = null;
      state.detailStatus = "idle";
      state.detailError = null;
    },
    clearHealResult(state) {
      state.healStatus = "idle";
      state.healError = null;
      state.healResult = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchQuarantineList
      .addCase(fetchQuarantineList.pending, (state) => {
        state.listStatus = "loading";
        state.listError = null;
      })
      .addCase(fetchQuarantineList.fulfilled, (state, action) => {
        state.listStatus = "succeeded";
        state.list = action.payload.records || [];
      })
      .addCase(fetchQuarantineList.rejected, (state, action) => {
        state.listStatus = "failed";
        state.listError = action.payload;
      })
      // fetchQuarantineDetail
      .addCase(fetchQuarantineDetail.pending, (state) => {
        state.detailStatus = "loading";
        state.detailError = null;
      })
      .addCase(fetchQuarantineDetail.fulfilled, (state, action) => {
        state.detailStatus = "succeeded";
        state.detail = action.payload;
      })
      .addCase(fetchQuarantineDetail.rejected, (state, action) => {
        state.detailStatus = "failed";
        state.detailError = action.payload;
      })
      // submitReview
      .addCase(submitReview.pending, (state) => {
        state.reviewStatus = "loading";
        state.reviewError = null;
      })
      .addCase(submitReview.fulfilled, (state, action) => {
        state.reviewStatus = "succeeded";
        if (state.detail) {
          state.detail.quarantineRecord = action.payload.quarantineRecord;
        }
      })
      .addCase(submitReview.rejected, (state, action) => {
        state.reviewStatus = "failed";
        state.reviewError = action.payload;
      })
      // cascadeHeal
      .addCase(cascadeHeal.pending, (state) => {
        state.healStatus = "loading";
        state.healError = null;
      })
      .addCase(cascadeHeal.fulfilled, (state, action) => {
        state.healStatus = "succeeded";
        state.healResult = action.payload;
      })
      .addCase(cascadeHeal.rejected, (state, action) => {
        state.healStatus = "failed";
        state.healError = action.payload;
      });
  },
});

export const { clearDetail, clearHealResult } = quarantineSlice.actions;
export default quarantineSlice.reducer;
