import assert from "node:assert/strict";
import test from "node:test";
import { milli, requiredMaterial, productionUnitCost } from "../lib/manufacturing-math.ts";
test("BOM math uses exact three-digit quantity precision",()=>{
  assert.equal(milli("2.125"),2125n);
  assert.equal(requiredMaterial(0.25,1,2.5),0.625);
  assert.equal(requiredMaterial(3,2,4),6);
  assert.throws(()=>requiredMaterial(0.001,3,1),/FRACTIONAL/);
  assert.throws(()=>milli("1.0001"),/INVALID/);
});
test("production costing derives from recorded materials without fake overhead",()=>{
  assert.deepEqual(productionUnitCost([{quantity:2,unitCost:5.25},{quantity:1,unitCost:2}],5),{totalCost:12.5,unitCost:2.5});
  assert.throws(()=>productionUnitCost([{quantity:1,unitCost:-1}],1),/INVALID_COST/);
});
