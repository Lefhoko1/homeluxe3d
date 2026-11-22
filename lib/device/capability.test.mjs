// Which devices get the light 3D. Run: node lib/device/capability.test.mjs
import assert from "node:assert/strict";
import { deviceTier, qualityFor } from "./capability.js";

const as = ({ memory, cores, saveData = false, net = "4g", phone = true, search = "" }) => {
  globalThis.window = {
    location: { search },
    navigator: { deviceMemory: memory, hardwareConcurrency: cores, connection: { saveData, effectiveType: net } },
    matchMedia: () => ({ matches: phone }),
    screen: phone ? { width: 360, height: 720 } : { width: 1920, height: 1080 },
  };
  return deviceTier();
};

assert.equal(as({ memory: 2, cores: 4 }), "low", "Huawei Y5: 2 GB, 4 cores");
assert.equal(as({ memory: 8, cores: 8 }), "high", "a recent phone");
assert.equal(as({ memory: 4, cores: 4 }), "low", "a 4-core phone");
assert.equal(as({ memory: 8, cores: 4, phone: false }), "high", "a 4-core laptop is fine");
assert.equal(as({ memory: 8, cores: 8, saveData: true }), "low", "data saver on");
assert.equal(as({ memory: 8, cores: 8, net: "3g" }), "low", "a 3G connection");
assert.equal(as({ memory: undefined, cores: undefined, phone: false }), "high", "a browser that reports nothing (Safari, Firefox desktop)");
assert.equal(as({ memory: 2, cores: 4, search: "?quality=high" }), "high", "?quality=high overrides");
assert.equal(as({ memory: 16, cores: 16, phone: false, search: "?quality=low" }), "low", "?quality=low overrides");
delete globalThis.window;
assert.equal(deviceTier(), "high", "on the server");

const low = qualityFor("low");
assert.equal(low.shadows, false);
assert.equal(low.pixelRatio, 1);
assert.ok(low.maxTrees <= 4);
console.log("  ok  Huawei Y5, 4-core phones, data saver and 3G get the light version; laptops and recent phones the full one");
console.log("capability: ok");
