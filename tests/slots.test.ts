import { test } from "node:test";
import assert from "node:assert/strict";

import { matchesSlot } from "../src/lib/setups/engine";
import { getSetupSpace, type SetupSlot } from "../src/lib/setups/blueprints";

/**
 * Slot matchers read product titles, and retail titles are written to sell, not
 * to classify. Every case below is a real listing that filled the wrong slot at
 * some point during the gaming build, so the exclusions stay load-bearing.
 */
function slot(space: string, key: string): SetupSlot {
  const found = getSetupSpace(space).slots.find((s) => s.key === key);
  assert.ok(found, `${space} has no ${key} slot`);
  return found;
}

/* --------------------------------- Desk ------------------------------------- */

test("a desk fan is not a desk", () => {
  assert.equal(
    matchesSlot(
      "portable desk fan usb rechargeable 6 inch personal cooling fan for table".toLowerCase(),
      slot("gaming", "desk"),
    ),
    false,
  );
  assert.equal(
    matchesSlot(
      "callas engineered wood computer desk with keyboard tray – small modern writing table",
      slot("gaming", "desk"),
    ),
    true,
  );
});

test("a desk mat is not a desk, and a desk is not a desk mat", () => {
  assert.equal(
    matchesSlot("striff desk pad non-slip pu leather desk blotter, waterproof", slot("gaming", "desk")),
    false,
  );
  assert.equal(
    matchesSlot("green soul venue study table for home & office, under-desk storage shelf", slot("gaming", "desk")),
    true,
  );
  assert.equal(
    matchesSlot("striff desk pad non-slip pu leather desk blotter", slot("gaming", "accessories")),
    true,
  );
});

test("monitor arms belong on the desk, monitor lights do not", () => {
  const accessories = slot("gaming", "accessories");
  assert.equal(
    matchesSlot("amazon basics dual monitor stand - height-adjustable arm mount, steel", accessories),
    true,
  );
  assert.equal(
    matchesSlot("artikel co12 single mount adjustable monitor arm vesa mount with c clamp", accessories),
    true,
  );
  assert.equal(matchesSlot("quntis monitor light bar hy214, screen monitor lamp", accessories), false);
  assert.equal(matchesSlot("hp k280 gaming keyboard", accessories), false);
});

/* ------------------------------- Lighting ----------------------------------- */

test("rgb inside a component title is not desk lighting", () => {
  const lighting = slot("gaming", "lighting");
  assert.equal(
    matchesSlot(
      "asus rog crosshair x670e hero amd am5 (ryzen 9000) e-atx motherboard, aura rgb, wifi 6e",
      lighting,
    ),
    false,
  );
  assert.equal(
    matchesSlot("zebronics 700 rgb lights 100 w bluetooth 2.1 speaker", lighting),
    false,
  );
  assert.equal(
    matchesSlot("one94store 5 meter smart led strip light with app & remote control", lighting),
    true,
  );
  assert.equal(
    matchesSlot("philips wiz 10w b22 wi-fi led smart bulb with music sync", lighting),
    true,
  );
});

/* -------------------------------- Speakers ---------------------------------- */

test("a headset that mentions speakers is still a headset", () => {
  const speakers = slot("gaming", "speakers");
  assert.equal(
    matchesSlot("havit hv-h2002d usb gaming headset with speakers, noise cancelling", speakers),
    false,
  );
  assert.equal(matchesSlot("mivi fort sonic 600 soundbar, 5.1 channel, bt v5.3", speakers), true);
  assert.equal(matchesSlot("zebronics jukebar 1600 bt 2.1 channel speaker", speakers), true);
});

/* -------------------------------- Controller -------------------------------- */

test("console-compatible headsets do not fill the controller slot", () => {
  const controller = slot("gaming", "controller");
  assert.equal(
    matchesSlot("havit h2002d gaming headsets for ps4, ps5, xbox controller, pc", controller),
    false,
  );
  assert.equal(matchesSlot("sony dualsense wireless controller white (playstation 5)", controller), true);
  assert.equal(matchesSlot("gamepad charging dock for xbox wireless controller", controller), false);
});

/* ----------------------------------- UPS ------------------------------------ */

test("lace-up shoes are not a power backup", () => {
  const ups = slot("gaming", "ups");
  assert.equal(
    matchesSlot("nike revolution 7 men's lace ups road running shoes", ups),
    false,
  );
  assert.equal(
    matchesSlot("zebronics zeb-u725 600va ups for desktop/pc/computers with surge protection", ups),
    true,
  );
  assert.equal(matchesSlot("apc back-ups bx600c-in 600va / 360w ups", ups), true);
});

/* ------------------------------ Storage & PSU ------------------------------- */

test("a prebuilt desktop combo is not an SSD", () => {
  assert.equal(
    matchesSlot(
      "computer cpu for desktop pc i3 4th generation | 8 gb ddr3 ram | 256gb nvme ssd | h81 motherboard",
      slot("gaming", "storage"),
    ),
    false,
  );
  assert.equal(
    matchesSlot("sandisk optimus 5100 nvme ssd, 500gb, upto 6600mb/s r, 5y warranty", slot("gaming", "storage")),
    true,
  );
});

test("laptop memory cannot enter a desktop build", () => {
  const ram = slot("gaming", "ram");
  assert.equal(matchesSlot("evm 8gb ddr3 laptop ram 1600mhz | so-dimm – 1.35v low voltage", ram), false);
  assert.equal(matchesSlot("matrix ddr4 4gb ram ddr4 4 gb (dual channel) pc ddr4", ram), true);
});

/* ------------------------------- Other spaces ------------------------------- */

test("the work-from-home desk rejects the same accessories the gaming desk does", () => {
  const desk = slot("wfh_desk", "desk");
  assert.equal(matchesSlot("usb portable desk fan with 3 speeds for study table", desk), false);
  assert.equal(matchesSlot("flipkart perfect homes dalton engineered wood study table", desk), true);
});

test("home theatre audio rejects headsets but keeps soundbars", () => {
  const audio = slot("home_theatre", "theatre_sound");
  assert.equal(matchesSlot("triggr roar 12 portable bt speaker with fm mode", audio), true);
  assert.equal(matchesSlot("hyperx cloud iii wired gaming headset for pc, ps5", audio), false);
});

/* ---------------------------- Machines & cameras ---------------------------- */

/**
 * Every accessory in a PC aisle prints the machine in its compatibility line —
 * "for Desktop/PC/Computers", "for laptop, pc, desktop" — so the machine slots
 * are the easiest ones in the blueprint set to get wrong. These are the four
 * listings that actually filled the Computer slot in a live build.
 */
test("a computer is the machine, never an accessory that names one", () => {
  const computer = slot("wfh_desk", "computer");
  assert.equal(
    matchesSlot(
      "cyberpower line interactive/offline ups ut1200e - 1200va / 720w, ups for personal computers, desktop pcs, laptops, routers",
      computer,
    ),
    false,
  );
  assert.equal(
    matchesSlot(
      "akai zest ms2222 22w 2.1 channel wired gaming speaker with subwoofer for laptop, pc, desktop, computer",
      computer,
    ),
    false,
  );
  assert.equal(
    matchesSlot("amd ryzen 3 3200g with radeon vega 8 graphics desktop processor 3rd generation", computer),
    false,
  );
  assert.equal(matchesSlot("mokobara the element backpack 17 l laptop backpack for 15.6 inch", computer), false);
  assert.equal(
    matchesSlot("portronics 35w adapto 35g type c pd fast charging adaptor for laptop, macbook, ipad", computer),
    false,
  );
  assert.equal(
    matchesSlot("asus vivobook 15 laptop (2026), intel core 5 120u, 16gb ram, 512gb ssd, windows 11", computer),
    true,
  );
  assert.equal(matchesSlot("apple 2026 macbook air 13 inch laptop with m5 chip", computer), true);
});

test("the editing computer slot rejects the same peripherals", () => {
  const computer = slot("creator_studio", "studio_computer");
  assert.equal(
    matchesSlot("zebronics zeb-u725 600va ups for desktop/pc/computers (not for routers)", computer),
    false,
  );
  assert.equal(
    matchesSlot("lenovo ideapad slim 3 13th gen intel core i3-1315u 15.6 inch fhd thin and light laptop", computer),
    true,
  );
});

test("a gimbal for a phone is not the studio camera", () => {
  const camera = slot("creator_studio", "studio_camera");
  assert.equal(
    matchesSlot("dji osmo mobile 7 gimbal stabilizer for iphone, android, built-in tripod, 3-axis phone gimbal", camera),
    false,
  );
  assert.equal(matchesSlot("lava virat v1 5g smartphone (4gb ram, 64gb storage)", camera), true);
  assert.equal(matchesSlot("canon eos 1500d dslr camera with ef-s 18-55mm is iii lens", camera), true);
});

test("a speaker's volume controller is not a gamepad", () => {
  const controller = slot("gaming", "controller");
  assert.equal(
    matchesSlot("akai zest ms2222 wired gaming speaker with subwoofer, rgb lights, volume controller", controller),
    false,
  );
  assert.equal(
    matchesSlot("cosmic byte ares wireless controller for pc, upgraded hall effect joystick", controller),
    true,
  );
});
