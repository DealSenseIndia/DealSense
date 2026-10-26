import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectMemoryGen,
  detectPlatform,
  hasIntegratedGraphics,
  memoryGensCompatible,
  memoryGensForPlatform,
  platformsCompatible,
} from "../src/lib/setups/compat";

/* ------------------------------ Socket detection ----------------------------- */

test("reads the platform an AMD processor states in its own title", () => {
  assert.equal(
    detectPlatform(
      "amd ryzen 5 9600x desktop processor with integrated radeon graphics, am5 socket, memory ddr5 up to 5600 mt/s",
    ),
    "am5",
  );
  assert.equal(
    detectPlatform("amd 5000 series ryzen 5 5600x desktop processor 6 cores 12 threads 35 mb cache"),
    "am4",
  );
  assert.equal(
    detectPlatform("amd ryzen 3 3200g with radeon vega 8 graphics desktop processor"),
    "am4",
  );
  assert.equal(
    detectPlatform("amd ryzen 7 7700x3d desktop processor with integrated radeon graphics"),
    "am5",
  );
  assert.equal(detectPlatform("amd ryzen 9 9950x3d desktop processor"), "am5");
});

test("reads the platform an Intel processor states in its own title", () => {
  assert.equal(
    detectPlatform("intel core i5-14400f desktop processor 10 cores (6 p-cores + 4 e-cores)"),
    "lga1700",
  );
  assert.equal(detectPlatform("intel i7-14700f 5.3 ghz lga1700 socket 12 cores"), "lga1700");
  assert.equal(detectPlatform("intel core i3 12100f 12th gen desktop pc processor"), "lga1700");
  assert.equal(detectPlatform("intel core ultra 5 245kf desktop processor"), "lga1851");
  assert.equal(detectPlatform("intel core i5 9600k 9th gen 6 cores lga1151"), "lga1151");
});

test("maps a motherboard to its socket from the chipset", () => {
  assert.equal(detectPlatform("gigabyte h610m h v2 motherboard supports intel core 14th cpus"), "lga1700");
  assert.equal(detectPlatform("msi b760m gaming plus wifi black motherboard, matx"), "lga1700");
  assert.equal(
    detectPlatform("asus b550 tuf gaming b550-plus wifi ii amd am4 (3rd gen ryzen) atx motherboard"),
    "am4",
  );
  assert.equal(detectPlatform("asrock b650 pg lightning socket amd am5 chipset b650"), "am5");
  assert.equal(detectPlatform("msi mag b850 tomahawk max wifi motherboard, atx"), "am5");
  assert.equal(detectPlatform("asus tuf gaming z890-plus wifi intel atx motherboard, ddr5"), "lga1851");
});

test("a phone or a laptop is not a desktop platform", () => {
  assert.equal(
    detectPlatform("vivo t5 lite 44w 5g (wave blue, 6gb ram, 128gb storage) | mediatek dimensity 6300 5g processor"),
    null,
  );
  assert.equal(detectPlatform("oneplus nord b5 5g smartphone"), null);
  assert.equal(detectPlatform("lenovo ideaPad 5 16abac03 16\" laptop"), null);
});

/* ----------------------------- Memory generation ---------------------------- */

test("reads the memory generation out of a title", () => {
  assert.equal(detectMemoryGen("patriot memory viper steel ddr4 ram 16gb (1x16gb) 3200mhz"), "ddr4");
  assert.equal(detectMemoryGen("corsair vengeance ddr5 16gb (1 x 16gb) up to 6000mhz"), "ddr5");
  assert.equal(detectMemoryGen("consistent 8gb ddr3 1600mhz desktop ram (memory) u-dimm"), "ddr3");
  assert.equal(detectMemoryGen("logitech g502 hero gaming mouse with on-board memory"), null);
});

/* -------------------------------- Agreement -------------------------------- */

test("compatible means the same stated platform, and unknown never blocks", () => {
  assert.equal(platformsCompatible("am5", "am5"), true);
  assert.equal(platformsCompatible("am4", "am5"), false);
  assert.equal(platformsCompatible("lga1700", "lga1851"), false);
  assert.equal(platformsCompatible(null, "am5"), true);
  assert.equal(platformsCompatible("am5", null), true);
  assert.equal(memoryGensCompatible("ddr4", "ddr5"), false);
  assert.equal(memoryGensCompatible(null, "ddr5"), true);
});

test("a socket states which memory generations it can take", () => {
  assert.deepEqual(memoryGensForPlatform("am4"), ["ddr4"]);
  assert.deepEqual(memoryGensForPlatform("am5"), ["ddr5"]);
  assert.deepEqual(memoryGensForPlatform("lga1700"), ["ddr4", "ddr5"]);
  assert.deepEqual(memoryGensForPlatform("lga1851"), ["ddr5"]);
  assert.deepEqual(memoryGensForPlatform("lga1151"), ["ddr3", "ddr4"]);
  assert.deepEqual(memoryGensForPlatform("lga1200"), ["ddr4"]);
});

test("an unknown socket constrains nothing", () => {
  assert.equal(memoryGensForPlatform(null), null);
});

/* ---------------------------- Integrated graphics ---------------------------- */

test("a chip that ships a GPU on the die is recognised", () => {
  assert.equal(hasIntegratedGraphics("amd ryzen 3 3200g with radeon vega 8 graphics desktop processor"), true);
  assert.equal(
    hasIntegratedGraphics("amd ryzen 5 5600gt desktop processor with integrated radeon graphics"),
    true,
  );
  assert.equal(hasIntegratedGraphics("amd ryzen 7 8700g desktop processor radeon 780m graphics"), true);
  assert.equal(hasIntegratedGraphics("intel core i3-14100 desktop processor 4 cores up to 4.7 ghz"), true);
  assert.equal(hasIntegratedGraphics("intel core i5-12400 desktop processor (includes intel uhd graphics)"), true);
  assert.equal(hasIntegratedGraphics("intel core ultra 7 265k desktop processor"), true);
});

test("an F-suffix or plainly titled chip is not assumed to display anything", () => {
  assert.equal(hasIntegratedGraphics("intel core i3-14100f fc-lga16a desktop processor 4 cores"), false);
  assert.equal(hasIntegratedGraphics("intel core i5-14400f desktop processor 10 cores"), false);
  assert.equal(hasIntegratedGraphics("amd ryzen 5 3500 3rd generation desktop processor 6 cores"), false);
  assert.equal(hasIntegratedGraphics("amd ryzen 5 5600x desktop processor 6 cores 12 threads"), false);
});
