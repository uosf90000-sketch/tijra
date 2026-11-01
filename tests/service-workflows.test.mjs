import assert from "node:assert/strict";
import test from "node:test";
import { nextServiceJobStatus as next } from "../lib/service-workflows.ts";
const base={status:"OPEN",action:"ASSIGN",role:"OWNER",isAssignedTechnician:false,assignedEmployeeId:null,note:"Assigned by service manager",targetEmployeeId:"emp-1"};
test("service lifecycle guards assignments, technician access and evidence",()=>{
  assert.equal(next(base),"SCHEDULED");
  assert.equal(next({...base,status:"SCHEDULED",action:"START",role:"STAFF",isAssignedTechnician:true,assignedEmployeeId:"emp-1",note:""}),"IN_PROGRESS");
  assert.equal(next({...base,status:"IN_PROGRESS",action:"COMPLETE",role:"STAFF",isAssignedTechnician:true,assignedEmployeeId:"emp-1",note:"Customer accepted repair"}),"COMPLETED");
  assert.throws(()=>next({...base,status:"OPEN",action:"COMPLETE"}),/REQUIRES_START/);
  assert.throws(()=>next({...base,role:"ACCOUNTANT"}),/ACCESS_DENIED/);
  assert.throws(()=>next({...base,status:"SCHEDULED",role:"STAFF",isAssignedTechnician:false,action:"START",assignedEmployeeId:"emp-1"}),/ACCESS_DENIED/);
  assert.throws(()=>next({...base,status:"IN_PROGRESS",action:"ASSIGN"}),/REASSIGN_IN_PROGRESS/);
  assert.throws(()=>next({...base,status:"COMPLETED",action:"CANCEL"}),/ALREADY_CLOSED/);
  assert.throws(()=>next({...base,status:"IN_PROGRESS",action:"COMPLETE",note:"short"}),/EVIDENCE_REQUIRED/);
});
