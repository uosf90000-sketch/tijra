import assert from "node:assert/strict";
import test from "node:test";
import {summarizeProfitShield} from "../lib/profit-shield.ts";
test("uses sale time costs and shows waste separately",()=>{
  const a=summarizeProfitShield([
    {id:"1",name:"coffee",qty:2,price:15,cost:5},
    {id:"1",name:"coffee",qty:1,price:12,cost:5},
  ],[{id:"1",qty:1,unitCost:2}]);
  assert.equal(a.total.revenue,42); assert.equal(a.total.cost,15);
  assert.equal(a.total.gross,27); assert.equal(a.total.afterWaste,25);
});
test("rejects malformed operational source values",()=>{
  assert.throws(()=>summarizeProfitShield([{id:"a",name:"A",qty:-1,price:1,cost:0}],[]),/INVALID_SALE/);
});
