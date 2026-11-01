/** Auditable field-service state transitions. No external delivery/OTP verification. */
export type JobStatus = "OPEN" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type JobAction = "ASSIGN" | "START" | "COMPLETE" | "CANCEL";
export function nextServiceJobStatus(input: {
  status: JobStatus; action: JobAction; role: string; isAssignedTechnician: boolean;
  assignedEmployeeId: string | null; note: string; targetEmployeeId?: string | null;
}): JobStatus {
  const {status,action,role,isAssignedTechnician,assignedEmployeeId,note,targetEmployeeId}=input;
  const manager = role==="OWNER" || role==="MANAGER";
  if (!manager && !(role==="STAFF" && isAssignedTechnician)) throw new Error("SERVICE_ACCESS_DENIED");
  if (status==="COMPLETED" || status==="CANCELLED") throw new Error("SERVICE_JOB_ALREADY_CLOSED");
  if (action==="ASSIGN") {
    if (!manager || !targetEmployeeId) throw new Error("SERVICE_ASSIGN_DENIED");
    if (note.trim().length<8) throw new Error("SERVICE_REASON_REQUIRED");
    if (status==="IN_PROGRESS") throw new Error("SERVICE_REASSIGN_IN_PROGRESS");
    return "SCHEDULED";
  }
  if (action==="START") {
    if (!assignedEmployeeId || (status!=="OPEN" && status!=="SCHEDULED")) throw new Error("SERVICE_START_CONFLICT");
    return "IN_PROGRESS";
  }
  if (action==="COMPLETE") {
    if (status!=="IN_PROGRESS") throw new Error("SERVICE_COMPLETE_REQUIRES_START");
    if (note.trim().length<8) throw new Error("SERVICE_EVIDENCE_REQUIRED");
    return "COMPLETED";
  }
  if (action==="CANCEL") {
    if (!manager) throw new Error("SERVICE_CANCEL_DENIED");
    if (note.trim().length<8) throw new Error("SERVICE_REASON_REQUIRED");
    return "CANCELLED";
  }
  throw new Error("SERVICE_INVALID_ACTION");
}
