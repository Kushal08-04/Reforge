import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "../../api/client";

export const fetchQuarantineList = createAsyncThunk(
  "quarantine/fetchList",
  async (params = {}, { rejectWithValue }) => {
    try {
      const res = await apiClient.get("/quarantine", { params });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const fetchQuarantineDetail = createAsyncThunk(
  "quarantine/fetchDetail",
  async (id, { rejectWithValue }) => {
    try {
      const res = await apiClient.get(`/quarantine/${id}`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const submitReview = createAsyncThunk(
  "quarantine/review",
  async ({ id, action, correctedValues, reviewer, notes }, { rejectWithValue }) => {
    try {
      const res = await apiClient.patch(`/quarantine/${id}/review`, {
        action,
        correctedValues,
        reviewer,
        notes,
      });
      return res.data;
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
  },
  reducers: {
    clearDetail(state) {
      state.detail = null;
      state.detailStatus = "idle";
      state.detailError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuarantineList.pending, (state) => {
        state.listStatus = "loading";
      })
      .addCase(fetchQuarantineList.fulfilled, (state, action) => {
        state.listStatus = "succeeded";
        state.list = action.payload.records;
      })
      .addCase(fetchQuarantineList.rejected, (state, action) => {
        state.listStatus = "failed";
        state.listError = action.payload;
      })

      .addCase(fetchQuarantineDetail.pending, (state) => {
        state.detailStatus = "loading";
      })
      .addCase(fetchQuarantineDetail.fulfilled, (state, action) => {
        state.detailStatus = "succeeded";
        state.detail = action.payload;
      })
      .addCase(fetchQuarantineDetail.rejected, (state, action) => {
        state.detailStatus = "failed";
        state.detailError = action.payload;
      })

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
      });
  },
});

export const { clearDetail } = quarantineSlice.actions;
export default quarantineSlice.reducer;
