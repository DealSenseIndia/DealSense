import { test } from "node:test";
import assert from "node:assert/strict";

import { matchesSlot } from "../src/lib/setups/engine";
import { getSetupSpace, type SetupSlot } from "../src/lib/setups/blueprints";
import { isParkedDuplicate } from "../src/lib/engine/duplicates";
import { swapCompatibilityError } from "../src/lib/setups/swap";

/**
 * Slot matching is a claim about what a product is. Each case below is a real
 * production listing that was either wrongly excluded (the coffee makers) or
 * wrongly admitted (the toy, patio, appliance and duplicate cases).
 */
function slot(space: string, key: string): SetupSlot {
  const found = getSetupSpace(space).slots.find((s) => s.key === key);
  assert.ok(found, `${space} has no ${key}`);
  return found;
}

const match = (space: string, key: string, title: string) =>
  matchesSlot(title.toLowerCase(), slot(space, key));

/* ------------------------------ tea brewer ------------------------------- */

test("real brewers with 'N Cups' in the name are no longer excluded", () => {
  const brewer = slot("tea_coffee", "tea_brewer");
  const makers = [
    "Morphy Richards Europa Anti-Drip Function|Dry Heat Protection|Warming Plate|2 Years Product Warranty 6 Cups Coffee Maker",
    "AGARO Classic Moka Pot, Stovetop Espresso, Premium Aluminium Built, 6 Cups Coffee Maker",
    "Pigeon 19001207 / SAP- 14327 5 Cups Coffee Maker",
    "Bialetti Moka Express Iconic Italian Stovetop Espresso Maker, Italian Made; Moka Pot/Percolator/Coffee Maker",
  ];
  for (const title of makers) {
    assert.equal(matchesSlot(title.toLowerCase(), brewer), true, title);
  }
});

test("cup and mug products still do not enter the brewing slot", () => {
  assert.equal(
    match("tea_coffee", "tea_brewer", "Set of 4 Ceramic Tea Cups with Stand Safe Stackable Coffee Mugs"),
    false,
  );
  assert.equal(match("tea_coffee", "tea_brewer", "Clay Craft Ceramic Gold Line Coffee Mugs/Tea Cups Set of 6"), false);
  assert.equal(match("tea_coffee", "tea_brewer", "Espresso Cup Set of 6, Porcelain"), false);
  assert.equal(match("tea_coffee", "tea_brewer", "Double Wall Coffee Mug 350ml"), false);
});

/* --------------------------- toy / baby guard ---------------------------- */

test("a Disney baby carrier is not a gaming mouse", () => {
  const carrier =
    "Babyhug Disney Mickey Mouse 9-in-1 Ergonomic Baby Carrier with Hip Seat: Breathable fabric";
  assert.equal(match("gaming", "mouse", carrier), false);
  assert.equal(match("gaming", "mouse", "Razer DeathAdder V3 Pro Wireless Gaming Mouse"), true);
});

test("toy, plush and baby products cannot enter a computer slot", () => {
  assert.equal(match("wfh_desk", "monitor", "Baby Monitor with Camera and Night Vision"), false);
  assert.equal(match("gaming", "headset", "Disney Plush Mickey Headphones for Kids"), false);
  assert.equal(match("wfh_desk", "keyboard_mouse", "Toy Keyboard for Toddlers"), false);
});

/* -------------------------------- chairs --------------------------------- */

test("patio and garden furniture never fills an indoor chair slot", () => {
  const patio =
    "Lotey Garden Patio Seating Chair And Table Set, Outdoor Balcony Garden Coffee Table Set";
  const outdoor = "Home Centre | Mesh Static Polypropylene Outdoor Chair | Chair for Home | Beige";
  for (const [room, key] of [
    ["wfh_desk", "chair"],
    ["gaming", "chair"],
    ["student", "chair"],
    ["hostel_starter", "hostel_chair"],
  ] as const) {
    assert.equal(match(room, key, patio), false, room);
    assert.equal(match(room, key, outdoor), false, room);
  }
  assert.equal(match("beauty_vanity", "vanity_seat", patio), false);
  assert.equal(match("beauty_vanity", "vanity_seat", "Solid Sheesham Wood Study Table with Chair"), false);
  assert.equal(
    match("gaming", "chair", "Warrior By ValorX USA Gaming & Office Ergonomic Chair"),
    true,
  );
});

/* ------------------------------ bedroom ---------------------------------- */

test("pet beds, desks and crib mobiles are not a bedroom bed", () => {
  const bed = slot("bedroom", "bed");
  assert.equal(matchesSlot("AmazonBasics Small Elevated Cooling Pet Dog Cot Bed", bed), false);
  assert.equal(matchesSlot("TECHNOVIBES Foldable Study Table/Bed Table/Foldable Desk", bed), false);
  assert.equal(
    matchesSlot("BabyGo Rotating Pony & Stars Musical Crib Cot Mobile | Rattle Toy", bed),
    false,
  );
  assert.equal(matchesSlot("WOODLAB Sheesham Wood Niwar Queen Size Bed with Box Storage", bed), true);
});

/* ------------------------- machines vs components ------------------------ */

test("memory modules are not a computer, but real laptops still are", () => {
  const ram = [
    "Consistent 8GB DDR3 Desktop RAM,1600MHz",
    "Patriot Memory Viper Steel DDR4 RAM 16GB (1X16GB) 3200MHz CL16 UDIMM Desktop Gaming Memory Module PVS416G320C6",
    "EVM 32GB DDR5 Desktop RAM Memory | 4800MHz | PC5-38400 | Long-DIMM | 288-Pin | CL19 | 1.1V Low Voltage",
  ];
  for (const title of ram) {
    assert.equal(match("wfh_desk", "computer", title), false, title);
    assert.equal(match("creator_studio", "studio_computer", title), false, title);
  }
  const laptops = [
    "Acer Aspire 3 (2026) Intel Core i5 13th Gen 1334U - (16 GB/512 GB SSD/Intel UHD Graphics/Windows 11 Home) Thin and Light Laptop/15",
    "ASUS Vivobook S16, Intel Core Ultra 5 225H, 16GB RAM, 512GB SSD, FHD+ 16\", Windows 11, Office Home 2024, Cool Silver, 1.7Kg, S3607CA-RP065WS, Intel iGPU, M365 Basic (1Year)* Metallic Design Laptop",
    "Lenovo LOQ Intel Core i7-13650HX 15.6\" (39.6cm) 144Hz 300Nits FHD Gaming Laptop (16GB/500 GB SSD/Win 11/NVDIA RTX 4050 6GB Graphics)",
    "Acer Aspire 3 Laptop Intel Core Celeron N4500 Processor Laptop (8 GB LPDDR4X SDRAM/256 GB SSD/Win11 Home/38 WHR/HD Webcam) A325-45",
  ];
  for (const title of laptops) {
    assert.equal(match("wfh_desk", "computer", title), true, title);
    assert.equal(match("creator_studio", "studio_computer", title), true, title);
  }
});

test("a spec-line keyboard, cover or battery does not disqualify the machine", () => {
  // Fourteen real tracked computers were being thrown away because their own
  // spec lines name a keyboard, a metal cover or a battery.
  const machines = [
    "acer Aspire 12th Gen Intel Core i3-12100 Processor Desktop (Windows 11 Home/8 GB RAM/512 GB SATA SSD/MS Office) with Standard Wired Keyboard and Wired Mouse, 3 Years Warranty",
    "Lenovo IdeaPad Slim 3 13th Gen, Intel Core i5-13420H, 16GB RAM, 512GB SSD, WUXGA, 15.3\"(38.8cm), Win 11, Office 2024, Grey, 1.6Kg, 83K100CGIN, Backlit, 1Yr ADP Free, Top Metal Cover, IPS, Laptop",
    "HP OmniBook 5 OLED (Previously Pavilion), Snapdragon X Processor 45 Tops (16GB LPDDR5x, 512GB SSD), 2K 14''/35.6cm, Win11, Office24, Silver, 1.29kg, he0014QU, Multi-Day Battery, AI Laptop",
    "ASUS Vivobook 16,Smartchoice, 13th Gen, Intel Core i5-13420H,16GB RAM,512GB SSD,FHD, OLED,Win 11,M365 Basic (1Y),Backlit Keyboard,Office 2024,Silver,1.88 kg,X1605VA-SH1952WS, Thin & Light Laptop",
    "Lenovo IdeaPad Slim 3 Smartchoice 13th Gen Intel Core i7-13620H 15.3 inch (38.8cm) WUXGA IPS Laptop (16GB RAM/512GB SSD/Windows 11/Office 24/Metal A Cover/Backlit Keyboard/Luna Grey/1.6Kg), 83K101JGIN",
  ];
  for (const title of machines) {
    assert.equal(match("wfh_desk", "computer", title), true, title);
    assert.equal(match("creator_studio", "studio_computer", title), true, title);
  }
  // The Student slot is "Laptop or tablet", so the acer desktop is not its
  // product — but every laptop above is.
  for (const title of machines.slice(1)) {
    assert.equal(match("student", "laptop", title), true, title);
  }
  assert.equal(match("student", "laptop", machines[0]), false);

  // The accessories themselves must still be refused by all three slots.
  const accessories = [
    "Logitech MK270r Wireless Keyboard and Mouse Combo for Windows, 2.4 GHz Wireless, 3-Year Battery Life, PC/Laptop Black",
    "Logitech MK345 Wireless Combo Full-Sized Keyboard with Palm Rest and Comfortable Right-Handed Mouse, Compatible with PC, Laptop - Black",
    "Ant Esports MK4000 Smartchoice Mechanical Gaming Keyboard, RGB LED Backlit Aluminium Base, Wired USB, PC Laptop PS5 Compatible",
    "Portronics Vader Wired Gaming Mouse with 6 Buttons, 1.5 m Long USB Cable for Laptop & PC (Blue)",
    "Sounce Apex Wired Gaming Mouse with 7200 DPI, Braided Cable, for PC Laptop Desktop Gamer Use (Black)",
    "HAMELIN MacBook Sleeve for 13.3 Inch Laptops | Vegan Leather Cover Bag for Laptop, Notebook & Tablets",
    "HP 330 15.6-inch Laptop Backpack/Trolley Pass-Through; Padded Back Panel",
    "Dyazo 360 Rotating Laptop Stand Holder | Height Adjustable & Foldable Riser for 10-15.6 Inch Laptop",
    "Callas Engineered Wood Computer Desk with Keyboard Tray - Small Modern Writing Desk, Sturdy & Simple Laptop Table",
  ];
  for (const title of accessories) {
    assert.equal(match("wfh_desk", "computer", title), false, title);
    assert.equal(match("creator_studio", "studio_computer", title), false, title);
  }
});

test("an effervescent health tablet is not the student's study machine", () => {
  const pill = "hk vitals Glutathione, Orange, 1 Effervescent Tablet (Sample Pack)";
  assert.equal(match("student", "laptop", pill), false);
  assert.equal(match("wfh_desk", "computer", pill), false);
  assert.equal(match("creator_studio", "studio_computer", pill), false);

  const realTablets = [
    "Xiaomi Pad 6 6 GB RAM 128 GB ROM 11.0 inch with Wi-Fi Only Qualcomm Snapdragon 870 Tablet (Graphite grey)",
    "REDMI Pad 2 4 GB RAM 128 GB ROM 11.0 inch with Wi-Fi+4G Gaming Tablet (Graphite Grey)",
    "REDMI Pad 2 Pro 5G 8 GB RAM 128 GB ROM 12.1 inch with Wi-Fi+5G Gaming Qualcomm Snapdragon 7s Gen 4 Tablet (Quick Silver)",
  ];
  for (const title of realTablets) {
    assert.equal(match("student", "laptop", title), true, title);
  }
});

/* --------------------------- computer parts ------------------------------ */

test("an internal SSD is not a computer, but a machine that mentions its SSD still is", () => {
  const drives = [
    "Samsung 990 EVO Plus 1 TB Desktop Black PCIe NVMe Internal Solid State Drive (SSD) (MZ-V9S1T0BW)",
    "Samsung 990 EVO Plus 4 TB Desktop Black PCIe NVMe Internal Solid State Drive (SSD) (MZ-V9S4T0BW)",
    "SANDISK Optimus 5100 NVMe SSD, 500GB, PCIe Gen 4 NVMe M.2 (2280), Gaming Storage, Internal Solid State Drive",
    "SanDisk Optimus GX 7100 NVMe 1 TB Internal SSD, Upto 7250 MB/s R, PCIe Gen 4.0 M.2 (2280)",
    "Samsung T9 Portable External SSD 1TB, USB 3.2, Storage for Professional Creators",
  ];
  for (const title of drives) {
    assert.equal(match("wfh_desk", "computer", title), false, title);
    assert.equal(match("creator_studio", "studio_computer", title), false, title);
  }
  // The interface words are the trap: this is a real tracked desktop whose
  // spec line says SATA SSD, and laptops say NVMe/PCIe/M.2. Blocking those
  // tokens would empty the Computer slot of actual computers.
  const machines = [
    "acer Aspire 12th Gen Intel Core i3-12100 Processor Desktop (Windows 11 Home/8 GB RAM/512 GB SATA SSD/MS Office) with Standard Wired Keyboard and Wired Mouse, 3 Years Warranty",
    "ASUS Vivobook 15 Laptop (2026), Intel Core 5 120U, 16GB RAM, 512GB PCIe NVMe M.2 SSD, Windows 11",
    "HP 15s AMD Ryzen 5 5500U 15.6 inch FHD Laptop (16GB RAM/512GB SSD/NVMe/Windows 11)",
  ];
  for (const title of machines) {
    assert.equal(match("wfh_desk", "computer", title), true, title);
  }
});

test("a graphics card is not a monitor", () => {
  const gpu = "Graphics Card, Monitor Video Card 1g Gddr5 128bit Pcie 2.0 X16 PC Video Card";
  assert.equal(match("wfh_desk", "monitor", gpu), false);
  assert.equal(match("gaming", "monitor", gpu), false);
  assert.equal(match("gaming", "monitor", "Samsung 49 Odyssey OLED G9 Curved Gaming Monitor"), true);
});

test("a makeup kit or motherboard bundle is not a keyboard and mouse", () => {
  assert.equal(match("wfh_desk", "keyboard_mouse", "SHISHI Makeup Kit with 5 Pink Makeup Brushes, 3in1 Combo"), false);
  assert.equal(
    match("wfh_desk", "keyboard_mouse", "H110 Motherboard Combo Kit + i5 Processor + 8GB DDR4 RAM"),
    false,
  );
  assert.equal(match("wfh_desk", "keyboard_mouse", "EvoFox Ronin X75 Plus Gaming Mechanical Keyboard"), true);
});

test("a laptop is not a webcam, an SSD or a monitor", () => {
  const laptop = "Acer Aspire 3 Laptop Intel Core Celeron N4500, 8 GB RAM, 256 GB SSD";
  assert.equal(match("wfh_desk", "webcam", laptop), false);
  assert.equal(match("wfh_desk", "monitor", laptop), false);
  assert.equal(match("gaming", "storage", "Apple MacBook Air (M5) 512 GB SSD"), false);
  assert.equal(match("wfh_desk", "webcam", "Logitech C922 Pro Stream Webcam HD 1080p"), true);
  assert.equal(match("gaming", "storage", "SanDisk Optimus GX 7100 NVMe 1 TB Internal SSD"), true);
});

test("a GPU/PSU bundle is not a standalone power supply", () => {
  assert.equal(match("gaming", "psu", "ZOTAC GPU + PSU Bundle"), false);
  assert.equal(match("gaming", "psu", "MSI MAG A650BN Power Supply Unit 650W 80 Plus Bronze"), true);
});

test("a fidget keychain is not a desk", () => {
  const toy = "Mechanical Keyboard Switch Fidget Keychain with LED Glow, Clicky Desk Toy";
  const desks = [
    ["wfh_desk", "desk"],
    ["gaming", "desk"],
    ["student", "desk"],
    ["hostel_starter", "hostel_desk"],
    ["creator_studio", "studio_desk"],
  ] as const;
  for (const [room, key] of desks) {
    assert.equal(match(room, key, toy), false, room);
  }
  assert.equal(match("wfh_desk", "desk", "Home Centre Quadro NXT Study Desk"), true);
});

/* ------------------------------ living room ------------------------------ */

test("a garden set is not a coffee table, and fairy lights are not curtains", () => {
  assert.equal(
    match("living_room", "coffee_table", "Lotey Garden Patio Seating Chair And Table Set Coffee Table Set"),
    false,
  );
  assert.equal(match("living_room", "coffee_table", "Solid Sheesham Wood Center Table"), true);
  for (const [room, key] of [
    ["bedroom", "curtains"],
    ["living_room", "curtains"],
    ["baby_nursery", "nursery_curtains"],
  ] as const) {
    assert.equal(match(room, key, "Gesto Leaf Curtain Fairy Lights 180 LED String Lights"), false, room);
    assert.equal(match(room, key, "Story@Home 100% True Blackout Window Curtains"), true, room);
  }
});

test("a vacuum or bean-bag filler is not living-room seating", () => {
  assert.equal(match("living_room", "sofa", "Inalsa MasterVac Clean Spot Cleaner for Carpet, Sofa"), false);
  assert.equal(match("living_room", "sofa", "DewDROP 4 kg Bean Bag Filler"), false);
  assert.equal(match("living_room", "sofa", "Wooden Carved Tufted Button 5 Seater Sofa Set"), true);
});

test("a bedside table and a vacuum are not cinema seats", () => {
  assert.equal(match("home_theatre", "theatre_seat", "FireBees 3-Tier Wooden Bedside Table, Sofa Side Table"), false);
  assert.equal(match("home_theatre", "theatre_seat", "Inalsa MasterVac Clean Spot Cleaner, Sofa Upholstery"), false);
  assert.equal(match("home_theatre", "theatre_seat", "Nilkamal Sierra Velvet Fabric Manual Recliner"), true);
});

/* --------------------------- nursery & kitchen --------------------------- */

test("a crib mobile is not a cot", () => {
  assert.equal(
    match("baby_nursery", "nursery_cot", "BabyGo Rotating Giraffe Musical Crib Cot Mobile | Rattle Toy"),
    false,
  );
  assert.equal(match("baby_nursery", "nursery_cot", "Babyhug Wooden Cot Bed with Mosquito Net"), true);
});

test("lunch boxes, locks and kitchen containers are not nursery storage", () => {
  assert.equal(match("baby_nursery", "nursery_storage", "ATTRO Freshmate Stainless Steel Lunch Box"), false);
  assert.equal(match("baby_nursery", "nursery_storage", "Hafele Kabi-Block Cabinet Lock, Fingerprint"), false);
  assert.equal(match("baby_nursery", "nursery_storage", "URBAA Small Storage Boxes, Set of 6"), true);
});

test("a laptop backpack is not a kitchen counter rack", () => {
  assert.equal(match("kitchen", "rack", "HP 330 15.6-inch Laptop Backpack/Trolley"), false);
  assert.equal(match("kitchen", "rack", "RAYMOX 4 Tier Storage Rack with Wheels"), true);
});

/* ------------------------------- tea corner ------------------------------ */

test("tea and coffee consumables are not skincare or tools", () => {
  assert.equal(match("tea_coffee", "tea_leaves", "POND'S Face Wash with Coffee Beans Bright Skin"), false);
  assert.equal(match("tea_coffee", "tea_leaves", "Clazkit Double Mesh Tea & Coffee Strainer"), false);
  assert.equal(match("tea_coffee", "tea_leaves", "TE-A-ME Berry Matcha Tea Powder, 50g"), true);
});

test("mixer grinders are not airtight jars; coffee makers are not trays", () => {
  assert.equal(match("tea_coffee", "tea_jars", "HAVELLS Silencio 500 W Mixer Grinder 4 Jars"), false);
  assert.equal(match("tea_coffee", "tea_jars", "CELLO Airtight Glass Jar, 1 Litre"), true);
  assert.equal(match("tea_coffee", "tea_tray", "Air Fryer Liners, Round Silicone Baking Tray"), false);
  assert.equal(match("tea_coffee", "tea_tray", "WOOD ART Sheesham Wood Serving Tray"), true);
});

/* ------------------------------ housewarming ----------------------------- */

test("appliances are not serveware, storage or a living plant", () => {
  const liner = "Air Fryer Liners, Round Silicone Basket Baking Tray";
  assert.equal(match("housewarming", "host_serveware", liner), false);
  assert.equal(match("housewarming", "host_storage", "Havells Prolife Brio Air Fryer 4.2 L"), false);
  assert.equal(match("housewarming", "host_throw", "The Pets Company Calming Dog & Cat Bed"), false);
  assert.equal(match("housewarming", "host_plant", "UHUD CRAFTS Mid Century Plant Stand/Table"), false);
  assert.equal(match("housewarming", "host_serveware", "Signoraware Big Plastic Serving Tray"), true);
  assert.equal(match("housewarming", "host_storage", "URBAA Small Storage Boxes, Set of 6"), true);
  assert.equal(match("housewarming", "host_throw", "ishro home Premium Cushion Cover 16 inch"), true);
  assert.equal(match("housewarming", "host_plant", "Greenkin Indoor Snake Live Plant"), true);
});

test("an air-fryer liner is not a garden planter", () => {
  assert.equal(match("balcony_garden", "garden_planters", "Air Fryer Liners, Silicone Baking Tray"), false);
  assert.equal(match("balcony_garden", "garden_planters", "Face Planter Pots for Indoor Plants"), true);
});

/* --------------------------- creator & travel ---------------------------- */

test("earbuds are not a studio microphone; a PC bundle is not an SD card", () => {
  assert.equal(match("creator_studio", "studio_mic", "boAt Airdopes Prime 300 with Quad Mics"), false);
  assert.equal(match("creator_studio", "studio_mic", "VELOMAX Wireless Microphone for YouTube"), true);
  assert.equal(match("creator_studio", "studio_storage", "H110 Motherboard Combo Kit + i5 Processor + RAM"), false);
  assert.equal(match("creator_studio", "studio_storage", "SanDisk Extreme SD Card 128GB"), true);
});

test("an item finder is not a cabin bag", () => {
  assert.equal(match("travel_ready", "travel_bag", "JioTag 2nd Generation Item Finder"), false);
  assert.equal(match("travel_ready", "travel_bag", "Safari Cabin Trolley 55cm Hard Case"), true);
});

/* -------------------------------- car care ------------------------------- */

test("nail polish, vacuums and phone jackets are not car-care tools", () => {
  assert.equal(match("car_care", "car_wash", "Nykaa Matte Nail Enamel Polish"), false);
  assert.equal(match("car_care", "car_wash", "CARE AUTO PARTS Microfiber Vehicle Washing Cloth"), true);
  assert.equal(match("car_care", "car_inflator", "EUREKA FORBES Atom Hand-held Vacuum Cleaner"), false);
  assert.equal(match("car_care", "car_inflator", "TUSA Storm X Cordless Tyre Inflator"), true);
  assert.equal(match("car_care", "car_mount", "Stealodeal Silicone Phone Jacket Card Holder"), false);
  assert.equal(match("car_care", "car_mount", "Kratos Grip X2 Car Mobile Holder"), true);
});

/* --------------------------- wardrobe & gym ------------------------------ */

test("a Bluetooth tracker is not a wallet, and a desk fan is not a fragrance", () => {
  assert.equal(match("capsule_wardrobe", "wardrobe_wallet", "JioTag 2nd Generation Item Finder"), false);
  assert.equal(match("capsule_wardrobe", "wardrobe_wallet", "URBAN FOREST Genuine Leather Wallet"), true);
  assert.equal(
    match("capsule_wardrobe", "wardrobe_fragrance", "UN1QUE Slim Portable Desk Fan with Fragrance"),
    false,
  );
  assert.equal(
    match("capsule_wardrobe", "wardrobe_fragrance", "Ajmal Love Muse EDP Perfume 100ml"),
    true,
  );
});

test("a dog chew rope is not a dumbbell", () => {
  assert.equal(match("home_gym", "gym_weights", "Knotted Dumbbell Rope for Dogs and Pets"), false);
  assert.equal(match("home_gym", "gym_weights", "Symactive 20 Kg Adjustable Dumbbell Set"), true);
});

test("a lunch box is not pet food storage", () => {
  assert.equal(match("pet_corner", "pet_storage", "ATTRO Freshmate Stainless Steel Lunch Box"), false);
  assert.equal(match("pet_corner", "pet_storage", "Pet Food Storage Container, Airtight 5kg"), true);
});

test("a PC cabinet is not a vanity mirror", () => {
  assert.equal(match("beauty_vanity", "vanity_mirror", "Zebronics Premium Gaming Cabinet Mid-Tower"), false);
  assert.equal(match("beauty_vanity", "vanity_mirror", "Myntra Makeup Table Top Mirror"), true);
});

test("a rocking chair or ottoman is not a vanity stool", () => {
  assert.equal(
    match(
      "beauty_vanity",
      "vanity_seat",
      "Solid Sheesham Wood Rocking Chair with Ottoman | Velvet Upholstered Relaxing Chair",
    ),
    false,
  );
  assert.equal(match("beauty_vanity", "vanity_seat", "Velvet Vanity Stool with Metal Legs"), true);
});

test("a ring light with its tripod is a light; a bare tripod is not", () => {
  assert.equal(
    match("creator_studio", "studio_light", "10 inch Ring Light with Tripod Stand and Phone Holder"),
    true,
  );
  assert.equal(
    match("creator_studio", "studio_light", "Ring Light Tripod Only, 2m Aluminium Stand"),
    false,
  );
});

test("an X99 board beside an LGA1700 processor is refused with the reason", () => {
  const error = swapCompatibilityError(
    "motherboard",
    {
      slotKey: "motherboard",
      title: "X99 Dual CPU Motherboard LGA2011 Support DDR4 ECC Memory PCB Durable",
      brand: null,
    },
    [{ slotKey: "cpu", title: "Intel i5-13400F Desktop Processor", brand: "Intel" }],
  );
  assert.ok(error);
  assert.match(error ?? "", /LGA2011/);
  assert.match(error ?? "", /LGA1700/);
});

test("a Ryzen 7 7700 and a B650 server board are accepted", () => {
  const error = swapCompatibilityError(
    "motherboard",
    {
      slotKey: "motherboard",
      title: "AsRock Rack B650D4U-2L2T/BCM Micro-ATX Server Motherboard Single Socket AM5",
      brand: "ASRock",
    },
    [
      { slotKey: "cpu", title: "AMD Ryzen 7 7700 Processor", brand: "AMD" },
      { slotKey: "ram", title: "Corsair Vengeance DDR5 16GB Kit", brand: "Corsair" },
    ],
  );
  assert.equal(error, null);
});

/* --------------------------- parked duplicates --------------------------- */

test("the builder excludes the same parked duplicates as the worker", () => {
  assert.equal(isParkedDuplicate("DUPLICATE: canonical listing 66e14058"), true);
  assert.equal(isParkedDuplicate("duplicate: canonical listing 66e14058"), true);
  assert.equal(isParkedDuplicate(null), false);
  assert.equal(isParkedDuplicate(""), false);
  assert.equal(isParkedDuplicate("EXTRACTION_FAILED_UNPRICED"), false);
  assert.equal(isParkedDuplicate("duplicate-ish but not parked"), false);
});
