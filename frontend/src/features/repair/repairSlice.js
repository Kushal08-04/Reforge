import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as api from "../../api/endpoints";

export const fetchRepairs = createAsyncThunk(
  "repair/fetchList",
  async (params = {}, { rejectWithValue }) => {
    try {
      const data = await api.fetchRepairsList(params);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const fetchRepairDetail = createAsyncThunk(
  "repair/fetchDetail",
  async (id, { rejectWithValue }) => {
    try {
      const data = await api.fetchRepairDetail(id);
      return data.proposal;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const triggerDiagnosis = createAsyncThunk(
  "repair/diagnose",
  async ({ quarantineRecordId, reviewer, mode }, { rejectWithValue }) => {
    try {
      const data = await api.diagnoseRepair({ quarantineRecordId, reviewer, mode });
      return data.proposal;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const runSandbox = createAsyncThunk(
  "repair/sandbox",
  async ({ id, reviewer }, { rejectWithValue }) => {
    try {
      const data = await api.executeSandboxVerification(id, reviewer);
      return data.proposal;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const exportPR = createAsyncThunk(
  "repair/createPR",
  async ({ id, reviewer }, { rejectWithValue }) => {
    try {
      const data = await api.createPullRequest(id, reviewer);
      return data.proposal;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

export const submitRepairReview = createAsyncThunk(
  "repair/review",
  async ({ id, decision, reviewer, notes }, { rejectWithValue }) => {
    try {
      const data = await api.reviewRepairProposal({ id, decision, reviewer, notes });
      return data.proposal;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || err.message);
    }
  }
);

const repairSlice = createSlice({
  name: "repair",
  initialState: {
    list: [],
    listStatus: "idle", // idle | loading | succeeded | failed
    listError: null,

    currentProposal: null,
    detailStatus: "idle",
    detailError: null,

    actionStatus: "idle", // idle | loading | succeeded | failed
    actionError: null,
    actionSuccessMsg: null,
  },
  reducers: {
    clearCurrentProposal(state) {
      state.currentProposal = null;
      state.detailStatus = "idle";
      state.detailError = null;
      state.actionStatus = "idle";
      state.actionError = null;
      state.actionSuccessMsg = null;
    },
    clearActionFeedback(state) {
      state.actionStatus = "idle";
      state.actionError = null;
      state.actionSuccessMsg = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchRepairs
      .addCase(fetchRepairs.pending, (state) => {
        state.listStatus = "loading";
        state.listError = null;
      })
      .addCase(fetchRepairs.fulfilled, (state, action) => {
        state.listStatus = "succeeded";
        state.list = action.payload.proposals || [];
      })
      .addCase(fetchRepairs.rejected, (state, action) => {
        state.listStatus = "failed";
        state.listError = action.payload;
      })
      // fetchRepairDetail
      .addCase(fetchRepairDetail.pending, (state) => {
        state.detailStatus = "loading";
        state.detailError = null;
      })
      .addCase(fetchRepairDetail.fulfilled, (state, action) => {
        state.detailStatus = "succeeded";
        state.currentProposal = action.payload;
      })
      .addCase(fetchRepairDetail.rejected, (state, action) => {
        state.detailStatus = "failed";
        state.detailError = action.payload;
      })
      // triggerDiagnosis
      .addCase(triggerDiagnosis.pending, (state) => {
        state.actionStatus = "loading";
        state.actionError = null;
      })
      .addCase(triggerDiagnosis.fulfilled, (state, action) => {
        state.actionStatus = "succeeded";
        state.currentProposal = action.payload;
        state.actionSuccessMsg = "Automated diagnosis completed: proposal created.";
      })
      .addCase(triggerDiagnosis.rejected, (state, action) => {
        state.actionStatus = "failed";
        state.actionError = action.payload;
      })
      // runSandbox
      .addCase(runSandbox.pending, (state) => {
        state.actionStatus = "loading";
        state.actionError = null;
      })
      .addCase(runSandbox.fulfilled, (state, action) => {
        state.actionStatus = "succeeded";
        state.currentProposal = action.payload;
        const verified = action.payload.lifecycleState === "VERIFIED";
        state.actionSuccessMsg = verified
          ? "Sandbox verification PASSED: semantic checks satisfied."
          : `Sandbox execution finished with state: ${action.payload.lifecycleState}`;
      })
      .addCase(runSandbox.rejected, (state, action) => {
        state.actionStatus = "failed";
        state.actionError = action.payload;
      })
      // exportPR
      .addCase(exportPR.pending, (state) => {
        state.actionStatus = "loading";
        state.actionError = null;
      })
      .addCase(exportPR.fulfilled, (state, action) => {
        state.actionStatus = "succeeded";
        state.currentProposal = action.payload;
        state.actionSuccessMsg = `GitHub Pull Request created: #${action.payload.githubIntegration?.prNumber || ""}`;
      })
      .addCase(exportPR.rejected, (state, action) => {
        state.actionStatus = "failed";
        state.actionError = action.payload;
      })
      // submitRepairReview
      .addCase(submitRepairReview.pending, (state) => {
        state.actionStatus = "loading";
        state.actionError = null;
      })
      .addCase(submitRepairReview.fulfilled, (state, action) => {
        state.actionStatus = "succeeded";
        state.currentProposal = action.payload;
        state.actionSuccessMsg = `Proposal successfully recorded as ${action.payload.lifecycleState}.`;
      })
      .addCase(submitRepairReview.rejected, (state, action) => {
        state.actionStatus = "failed";
        state.actionError = action.payload;
      });
  },
});

export const { clearCurrentProposal, clearActionFeedback } = repairSlice.actions;
export default repairSlice.reducer;
