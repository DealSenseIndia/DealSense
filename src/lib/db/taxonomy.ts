import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { listings, products } from "./schema";

/* ==================================================================
   The full DealSense taxonomy — every umbrella, every sub-category,
   every leaf. A product only appears under a leaf we actually track.
   ================================================================== */

export interface TaxonomyChild {
  name: string;
  leaves: string[];
}

export interface TaxonomyGroup {
  slug: string;
  name: string;
  icon: string;
  description: string;
  children: TaxonomyChild[];
}

export const TAXONOMY: TaxonomyGroup[] = [
  {
    slug: "computers-accessories",
    name: "Computers & Accessories",
    icon: "🖥️",
    description: "Laptops, desktops, monitors, keyboards, mice, printers, storage and PC parts.",
    children: [
      { name: "Laptops & Desktops", leaves: ["Laptops", "Gaming Laptops", "All in One PCs", "Traditional Laptops"] },
      { name: "Computer Accessories", leaves: ["Computers & Accessories", "Computer Keyboards", "Computer Mice", "Keyboards", "Mice", "Laptop Bags", "Laptop Stands", "Desk Accessories", "Keyboard & Mouse Sets", "Monitor Arms", "Headphone Stands"] },
      { name: "Monitors & Displays", leaves: ["Monitors", "Smart TVs", "Televisions"] },
      { name: "Printers & Scanners", leaves: ["Printers", "Ink Cartridges", "Laser Toner", "Photo Paper"] },
      { name: "Networking", leaves: ["Wi-fi Routers", "Routers", "Networking"] },
      { name: "Storage & Parts", leaves: ["RAM", "Processors", "Graphics Cards", "Motherboards", "Power Supplies", "Storage", "CPU Coolers", "PC Cases", "Capture Cards", "UPS", "Memory"] },
    ],
  },
  {
    slug: "electronics",
    name: "Electronics",
    icon: "💻",
    description: "Mobiles, smart TVs, headphones, audio, cameras, wearables and gaming.",
    children: [
      { name: "Mobiles & Tablets", leaves: ["Smartphones", "Tablets", "Mobile Accessories", "Cases & Covers", "Chargers", "Power Banks", "Mobiles & Gadgets"] },
      { name: "TV & Home Entertainment", leaves: ["Smart TVs", "Televisions", "Streaming Devices", "Soundbars", "Soundbar Speakers", "Home Theater", "Projectors"] },
      { name: "Audio", leaves: ["Headphones", "Earbuds", "Speakers", "Microphones", "In-Ear", "Over-Ear", "Bluetooth Speakers", "Headsets"] },
      { name: "Cameras & Photography", leaves: ["DSLR Cameras", "Digital Cameras", "Mirrorless", "Lenses", "Action Cameras", "Tripods", "Drones", "Camera Accessories", "Gimbals", "Webcams"] },
      { name: "Wearables", leaves: ["Smartwatches", "Fitness Bands", "Wearable Accessories", "Watches", "Smart Watches", "Wrist Watches"] },
      { name: "Gaming", leaves: ["Gaming Consoles", "Controllers", "Gaming Chairs", "Gaming Monitors", "PC Gaming Components"] },
    ],
  },
  {
    slug: "home-living",
    name: "Home & Living",
    icon: "🛋️",
    description: "Furniture, home decor, lighting, bedding, kitchen and cleaning appliances.",
    children: [
      { name: "Furniture", leaves: ["Beds", "Mattresses", "Sofas", "Chairs", "Tables", "Desks", "Wardrobes", "Storage", "Shelves", "Wall Shelves", "TV Units", "Dressers", "Outdoor Furniture", "Carpets"] },
      { name: "Home Decor", leaves: ["Wall Decor", "Lamps", "Rugs", "Curtains", "Plants", "Clocks", "Home Decor", "Showpieces", "Wall Panels", "Vases", "Planters", "Flower Pots", "Garden Tools", "Gardening", "Cushions"] },
      { name: "Lighting", leaves: ["Ceiling Lights", "Table Lamps", "Floor Lamps", "LED Strips", "Smart Lighting"] },
      { name: "Bedding & Linen", leaves: ["Bed Sheets", "Bedsheets", "Bed Linen", "Pillows", "Blankets", "Comforters", "Mattress Protectors"] },
      { name: "Kitchen & Dining", leaves: ["Cookware", "Dinnerware", "Storage Containers", "Kitchen Tools", "Gas Stoves", "Air Fryers", "Refrigerators", "Washing Machines", "Jars & Containers", "Cups & Mugs", "Serveware", "Kitchen Appliances"] },
      { name: "Home Appliances", leaves: ["Washing Machines", "Air Conditioners", "Air Purifiers", "Fans", "Heaters", "Geysers", "Mixer Grinders", "Induction Cooktop", "Induction Cooktops", "Electric Kettles", "Pop-up Toasters", "Juicers", "Microwave", "Dishwashers", "Water Purifiers"] },
      { name: "Bathroom", leaves: ["Bathroom Accessories", "Towels", "Mirrors", "Storage"] },
      { name: "Cleaning Appliances", leaves: ["Vacuum Cleaners", "Steam Cleaners", "Air Purifiers", "Water Purifiers"] },
    ],
  },
  {
    slug: "fashion",
    name: "Fashion & Apparel",
    icon: "👗",
    description: "Men, women and kids fashion, footwear, watches, jewellery, bags and accessories.",
    children: [
      { name: "Men", leaves: ["Clothing", "T-Shirts", "Shirts", "Jeans", "Trousers", "Ethnic Wear", "Sweatshirts", "Tshirts", "Shorts", "Innerwear", "Kurta Sets"] },
      { name: "Women", leaves: ["Dresses", "Tops", "Sarees", "Kurtas", "Jeans", "Activewear", "Kurtas & Kurtis", "Salwar Suits", "Leggings", "Nightwear", "Co-ord Sets"] },
      { name: "Shoes", leaves: ["Casual Shoes", "Sports Shoes", "Formal Shoes", "Sneakers", "Sandals", "Running Shoes", "Training Shoes", "Volleyball Shoes", "Nike Sports Shoes", "Nike Casual Shoes", "Nike Run Defy", "Shoes", "Flip-Flops"] },
      { name: "Watches", leaves: ["Analog Watches", "Digital Watches", "Smartwatches", "Chronograph", "Watches"] },
      { name: "Bags & Luggage", leaves: ["Backpacks", "Handbags", "Wallets", "Clutches", "Messenger Bags", "Bags", "Travel Accessories", "Luggage", "Trolley Bags"] },
      { name: "Jewellery", leaves: ["Necklaces", "Earrings", "Rings", "Bracelets", "Gold & Silver", "Jewellery", "Jewelry"] },
      { name: "Accessories", leaves: ["Belts", "Wallets", "Caps", "Scarves", "Socks"] },
      { name: "Sunglasses", leaves: ["Aviator", "Wayfarer", "Round", "Polarized Sunglasses", "Sunglasses"] },
    ],
  },
  {
    slug: "beauty-personal-care",
    name: "Beauty & Personal Care",
    icon: "💄",
    description: "Skincare, makeup, hair care, fragrances, personal care appliances and grooming.",
    children: [
      { name: "Skincare", leaves: ["Cleansers", "Moisturizers", "Moisturisers", "Serums", "Sunscreen", "Face Wash", "Face Masks", "Serum", "Toners & Mists", "Hand Creams"] },
      { name: "Makeup", leaves: ["Lipstick", "Lipsticks", "Foundation", "Eyeliner", "Mascara", "Compact Powder", "Makeup Kits", "Makeup", "Face Makeup", "Eye Makeup", "Nail Care"] },
      { name: "Hair Care", leaves: ["Shampoo", "Shampoos", "Conditioner", "Conditioners", "Hair Oil", "Hair Oils", "Hair Serum", "Hair Serums", "Hair Color", "Hair Masks & Packs", "Hair Sprays & Mists", "Hair Care", "Hair Styling"] },
      { name: "Fragrances", leaves: ["Perfume", "Perfumes", "Fragrance", "Deodorant", "Deodorants", "Body Mists", "Cologne"] },
      { name: "Bath & Body", leaves: ["Body Wash", "Soaps", "Body Lotions", "Scrubs"] },
      { name: "Personal Care Appliances", leaves: ["Trimmers", "Clippers & Trimmers", "Hair Dryers", "Straighteners", "Shavers"] },
      { name: "Men's Grooming", leaves: ["Beard Oils", "Aftershave", "Shaving Creams", "Grooming Kits"] },
      { name: "Health Care", leaves: ["Oral Care", "Electric Toothbrushes", "Sanitizers", "Personal Hygiene"] },
    ],
  },
  {
    slug: "sports-fitness",
    name: "Sports & Fitness",
    icon: "🏋️",
    description: "Exercise equipment, sportswear, footwear, fitness accessories and sports nutrition.",
    children: [
      { name: "Exercise Equipment", leaves: ["Dumbbells", "Treadmills", "Exercise Bikes", "Resistance Bands", "Kettlebells", "Yoga Mats", "Massage Guns", "Foam Rollers", "Fitness Equipment", "Fitness"] },
      { name: "Fitness Accessories", leaves: ["Gym Gloves", "Shakers", "Wrist Wraps", "Yoga Blocks", "Skipping Ropes", "Water Bottles"] },
      { name: "Sportswear", leaves: ["Track Pants", "Gym T-Shirts", "Sports Bras", "Compression Wear"] },
      { name: "Footwear", leaves: ["Running Shoes", "Training Shoes", "Football Studs", "Badminton Shoes", "Sports Shoes", "Volleyball Shoes"] },
      { name: "Outdoor Recreation", leaves: ["Tents", "Hiking Backpacks", "Trekking Poles", "Sleeping Bags", "Running"] },
      { name: "Yoga & Meditation", leaves: ["Yoga Mats", "Meditation Cushions", "Yoga Straps"] },
      { name: "Sports Nutrition", leaves: ["Whey Protein", "BCAA", "Creatine", "Energy Bars"] },
    ],
  },
  {
    slug: "automotive",
    name: "Automotive",
    icon: "🚗",
    description: "Car accessories, electronics, tyres, car care, motorcycle gear and helmets.",
    children: [
      { name: "Car Accessories", leaves: ["Seat Covers", "Car Mats", "Sunshades", "Steering Covers", "Car Accessories", "Air Fresheners"] },
      { name: "Motorcycle Accessories", leaves: ["Bike Covers", "Mobile Mounts", "Tank Bags", "Riding Bags"] },
      { name: "Car Electronics", leaves: ["Dash Cameras", "Car Chargers", "GPS Navigators", "Reverse Cameras"] },
      { name: "Tyres & Rims", leaves: ["Car Tyres", "Motorcycle Tyres", "Alloy Wheels", "Tyre Inflators"] },
      { name: "Car Care & Cleaning", leaves: ["Car Shampoos", "Microfiber Cloths", "Polishes", "Car Vacuums", "Car Care"] },
      { name: "Helmets & Riding Gear", leaves: ["Full Face Helmets", "Riding Jackets", "Gloves", "Knee Guards"] },
      { name: "Tools & Equipment", leaves: ["Jack Kits", "Jump Starters", "Air Compressors", "Socket Sets"] },
    ],
  },
  {
    slug: "baby-kids",
    name: "Baby & Kids",
    icon: "🧸",
    description: "Baby gear, toys, clothing, feeding, baby care, safety and nursery essentials.",
    children: [
      { name: "Baby Gear", leaves: ["Strollers", "Car Seats", "Baby Carriers", "High Chairs", "Walkers"] },
      { name: "Toys & Games", leaves: ["Soft Toys", "Rattles", "Building Blocks", "Educational Toys", "Toys & Games"] },
      { name: "Baby Care", leaves: ["Diapers", "Wipes", "Baby Lotions", "Baby Powder", "Baby Shampoos", "Baby Care", "Onesies & Rompers", "Baby Toys"] },
      { name: "Kids Fashion", leaves: ["Boys Clothes", "Girls Clothes", "Kids Shoes", "Ethnic Wear"] },
      { name: "Feeding & Nursing", leaves: ["Feeding Bottles", "Breast Pumps", "Sterilizers", "Baby Food"] },
      { name: "Baby Safety", leaves: ["Baby Monitors", "Safety Gates", "Corner Guards", "Child Locks"] },
      { name: "Nursery", leaves: ["Baby Cribs", "Cots", "Baby Bedding", "Mattresses"] },
    ],
  },
  {
    slug: "grocery-gourmet",
    name: "Grocery & Gourmet Foods",
    icon: "🛒",
    description: "Coffee, tea, snacks, branded foods, organic picks and everyday grocery.",
    children: [
      { name: "Coffee & Tea", leaves: ["Coffee", "Tea", "Green Tea", "Herbal Teas", "Chyawanprash"] },
      { name: "Snacks & Branded Foods", leaves: ["Biscuits", "Chips", "Chocolates", "Instant Noodles", "Energy Bars", "Protein Bars", "Snacks"] },
      { name: "Drinks", leaves: ["Fruit Juices", "Health Drinks", "Soft Drinks", "Cologne"] },
      { name: "Healthy & Organic", leaves: ["Honey", "Oats", "Dry Fruits", "Seeds", "Whey Protein", "Plant Protein", "Mass Gainers", "Multivitamins", "Vitamin C", "Vitamin D3", "Omega 3", "Biotin", "Ashwagandha", "Giloy", "Triphala", "Jams & Preserves"] },
      { name: "Grocery Staples", leaves: ["Rice", "Atta", "Sugar", "Cooking Oil", "Spices", "Pulses & Grains", "Grocery Staples"] },
    ],
  },
  {
    slug: "books-stationery",
    name: "Books & Media",
    icon: "📚",
    description: "Books, school supplies, office supplies, writing instruments, art and printers.",
    children: [
      { name: "Books", leaves: ["Books", "Fiction", "Non-Fiction", "Self-Help", "Biographies", "Business"] },
      { name: "School Books", leaves: ["NCERT", "CBSE", "Reference Books", "Children's Books"] },
      { name: "Office Supplies", leaves: ["Files & Folders", "Desk Organizers", "Staplers", "Calculators", "Office Supplies"] },
      { name: "Writing Instruments", leaves: ["Ball Pens", "Gel Pens", "Fountain Pens", "Markers", "Highlighters"] },
      { name: "Art & Craft", leaves: ["Sketchbooks", "Acrylic Paints", "Watercolors", "Paint Brushes"] },
      { name: "Notebooks & Diaries", leaves: ["Notebooks", "Ruled Notebooks", "Spiral Diaries", "Journals", "Planners"] },
      { name: "Printers & Ink", leaves: ["Printers", "Ink Cartridges", "Laser Toner", "Photo Paper", "All-in-One Printers"] },
    ],
  },
  {
    slug: "grocery-essentials",
    name: "Grocery & Essentials",
    icon: "🛒",
    description: "Daily food & beverages, branded snacks, household and personal essentials.",
    children: [
      { name: "Food & Beverages", leaves: ["Tea", "Coffee", "Fruit Juices", "Health Drinks", "Soft Drinks"] },
      { name: "Snacks & Branded Foods", leaves: ["Biscuits", "Chips", "Chocolates", "Instant Noodles"] },
      { name: "Personal Care Essentials", leaves: ["Soaps", "Shampoos", "Toothpaste", "Handwash"] },
      { name: "Household Essentials", leaves: ["Laundry Detergents", "Dishwash", "Surface Cleaners"] },
      { name: "Baby Essentials", leaves: ["Baby Food", "Diapers", "Baby Wipes", "Baby Formula"] },
      { name: "Pet Essentials", leaves: ["Pet Food", "Treats", "Pet Shampoo", "Odor Removers", "Pet Supplies", "Pet Beds", "Aquariums", "Dog Beds"] },
    ],
  },
  {
    slug: "health-nutrition",
    name: "Health & Nutrition",
    icon: "💊",
    description: "Vitamins, health devices, ayurvedic remedies, fitness nutrition and medical supplies.",
    children: [
      { name: "Vitamins & Supplements", leaves: ["Multivitamins", "Vitamin C", "Vitamin D3", "Omega 3", "Biotin"] },
      { name: "Health Care Devices", leaves: ["Blood Pressure Monitors", "Glucometers", "Pulse Oximeters", "Thermometers"] },
      { name: "Ayurveda & Herbal", leaves: ["Chyawanprash", "Ashwagandha", "Giloy", "Herbal Teas", "Triphala"] },
      { name: "Protein & Fitness Nutrition", leaves: ["Whey Protein", "Plant Protein", "Mass Gainers", "Protein Bars"] },
      { name: "Health Foods", leaves: ["Green Tea", "Honey", "Oats", "Dry Fruits", "Seeds"] },
      { name: "Medical Supplies", leaves: ["First Aid Kits", "Bandages", "Masks", "Ointments"] },
    ],
  },
  {
    slug: "toys-games",
    name: "Toys & Games",
    icon: "🎮",
    description: "Action figures, building sets, board games, educational toys and RC vehicles.",
    children: [
      { name: "Action Figures", leaves: ["Marvel Figures", "Anime Figures", "Transformers", "DC Collectibles"] },
      { name: "Building Sets", leaves: ["LEGO", "Magnetic Tiles", "Building Bricks", "Construction Toys"] },
      { name: "Board Games", leaves: ["Monopoly", "Chess", "Scrabble", "Catan", "Carrom"] },
      { name: "Educational Toys", leaves: ["STEM Kits", "Science Experiment Kits", "Coding Robots", "Globe"] },
      { name: "Remote Control Toys", leaves: ["RC Cars", "RC Drones", "RC Helicopters", "RC Boats"] },
      { name: "Puzzles", leaves: ["1000 Piece Jigsaw", "3D Puzzles", "Wooden Brain Teasers"] },
      { name: "Outdoor Toys", leaves: ["Scooters", "Skates", "Water Guns", "Nerf Blasters", "Trampolines"] },
    ],
  },
  {
    slug: "pet-supplies",
    name: "Pet Supplies",
    icon: "🐾",
    description: "Pet food, accessories, grooming, pet health, toys, beds and aquariums.",
    children: [
      { name: "Pet Food", leaves: ["Dry Dog Food", "Wet Cat Food", "Bird Seed", "Puppy Kibble"] },
      { name: "Pet Accessories", leaves: ["Leashes", "Collars", "Harnesses", "Feeding Bowls", "ID Tags"] },
      { name: "Grooming", leaves: ["Pet Shampoos", "Brushes", "Nail Trimmers", "Pet Wipes"] },
      { name: "Health Care", leaves: ["Flea & Tick Treatments", "Dewormers", "Joint Supplements", "Ear Cleaners"] },
      { name: "Toys", leaves: ["Chew Toys", "Squeaky Balls", "Cat Scratchers", "Laser Toys"] },
      { name: "Beds & Furniture", leaves: ["Orthopedic Dog Beds", "Cat Trees", "Crates", "Cages"] },
      { name: "Aquarium Supplies", leaves: ["Fish Tanks", "Water Filters", "Air Pumps", "Fish Food", "Aquarium Decor"] },
    ],
  },
  {
    slug: "office-supplies",
    name: "Office Supplies",
    icon: "🖇️",
    description: "Ergonomic furniture, paper, toner, office electronics and organization tools.",
    children: [
      { name: "Office Furniture", leaves: ["Ergonomic Office Chairs", "Standing Desks", "File Cabinets", "Bookcases"] },
      { name: "Paper & Stationery", leaves: ["A4 Copy Paper", "Sticky Notes", "Envelopes", "Legal Pads"] },
      { name: "Ink & Toner", leaves: ["HP Toner", "Canon Cartridges", "Epson Ink Bottles", "Brother Toners"] },
      { name: "Office Electronics", leaves: ["Paper Shredders", "Laminators", "Scientific Calculators", "Label Makers"] },
      { name: "Storage & Organization", leaves: ["File Organizers", "Desk Tidy Trays", "Storage Boxes", "Magazine Racks"] },
    ],
  },
  {
    slug: "musical-instruments",
    name: "Musical Instruments",
    icon: "🎸",
    description: "Guitars, keyboards, drums, studio equipment, DJ gear and string instruments.",
    children: [
      { name: "Guitars", leaves: ["Acoustic Guitars", "Electric Guitars", "Classical Guitars", "Ukuleles"] },
      { name: "Keyboards", leaves: ["Digital Pianos", "Synthesizers", "MIDI Keyboards", "Portable Keyboards"] },
      { name: "Drums & Percussion", leaves: ["Drum Sets", "Electronic Drums", "Bongos", "Cajons"] },
      { name: "Studio Equipment", leaves: ["Audio Interfaces", "Condenser Microphones", "Studio Monitors", "Headphones"] },
      { name: "DJ & Audio Gear", leaves: ["DJ Controllers", "Mixers", "PA Speakers", "DJ Headphones"] },
      { name: "String Instruments", leaves: ["Violins", "Cellos", "Mandolins", "Sitars"] },
    ],
  },
  {
    slug: "travel-luggage",
    name: "Travel & Luggage",
    icon: "✈️",
    description: "Suitcases, trolleys, travel backpacks, packing cubes and travel accessories.",
    children: [
      { name: "Suitcases & Trolleys", leaves: ["Cabin Trolleys", "Check-in Bags", "Hard Suitcases", "Soft Trolleys"] },
      { name: "Backpacks", leaves: ["Laptop Backpacks", "Trekking Rucksacks", "Casual Backpacks", "Travel Backpacks"] },
      { name: "Travel Accessories", leaves: ["Neck Pillows", "Universal Adapters", "Luggage Weighing Scales", "Luggage Tags"] },
      { name: "Travel Essentials", leaves: ["Packing Cubes", "Toiletry Bags", "Passport Holders", "Money Belts"] },
      { name: "Duffel Bags", leaves: ["Gym Duffels", "Wheeled Duffel Bags", "Leather Weekender Bags"] },
      { name: "Laptop Bags", leaves: ["Briefcases", "Messenger Bags", "Laptop Sleeves"] },
    ],
  },
];

/* ==================================================================
   Matching a raw store category to the taxonomy
   ================================================================== */

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Whole words of a category name, "&" read as a separator. */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, " ")
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

/** Every leaf in the tree, flattened once at module load. */
const ALL_LEAVES: string[] = TAXONOMY.flatMap((g) => g.children.flatMap((c) => c.leaves));

/** Brand shelves and odd store category names that need a hand. */
const ALIASES: Record<string, string> = {
  // Brand shelves: the store filed the whole brand as one category, so the
  // category name says who made it, not what it is. Placed by hand.
  libas: "Kurtas & Kurtis",
  darshanamworldcomputercomponents: "Computers & Accessories",
  combosnykaa: "Makeup Kits",
  // Spelling and wording variants our importers grew into.
  notebookcomputerstands: "Laptop Stands",
  tventertainmentunits: "TV Units",
  shelving: "Shelves",
  bedlinen: "Bed Linen",
  moisturisers: "Moisturizers",
  keyboardandmousesets: "Keyboard & Mouse Sets",
  // Categories that read as one thing and are another. Whole-word matching in
  // resolveLeaf refuses to guess across words, so these need naming by hand.
  handcreamsandmasks: "Hand Creams",
  handcreamsmasks: "Hand Creams",
  // Every soundbar and 2.1 speaker the stores filed under a bare "Audio" shelf.
  audio: "Speakers",
  sofasets: "Sofas",
  snackgifts: "Snacks",
  coffeemakers: "Kitchen Appliances",
  morphyrichardscoffeemakers: "Kitchen Appliances",
  agarocoffeemakers: "Kitchen Appliances",
  pigeoncoffeemakers: "Kitchen Appliances",
  appplemobiles: "Smartphones",
  applemobiles: "Smartphones",
  oneplusmobiles: "Smartphones",
  samsungmobiles: "Smartphones",
  vivomobiles: "Smartphones",
  nothingmobiles: "Smartphones",
  basicmobiles: "Smartphones",
  realmemobiles: "Smartphones",
  xiaomimobiles: "Smartphones",
  oppomobiles: "Smartphones",
  motorola: "Smartphones",
  mob: "Smartphones",
  mobile: "Smartphones",
  phones: "Smartphones",
  smartphone: "Smartphones",
  smartwatches: "Smartwatches",
  smartwatch: "Smartwatches",
  watch: "Watches",
  watches: "Watches",
  nikesportsshoes: "Sports Shoes",
  nikecasualshoes: "Casual Shoes",
  nikerundefymensshoes: "Running Shoes",
  nikerundefy: "Running Shoes",
  nikerundefymensroadshoes: "Running Shoes",
  nikerundefywomen: "Running Shoes",
  sportsshoes: "Sports Shoes",
  runningshoes: "Running Shoes",
  trainingshoes: "Training Shoes",
  volatleyballshoes: "Volleyball Shoes",
  volleyballshoes: "Volleyball Shoes",
  casualshoes: "Casual Shoes",
  sneakers: "Sneakers",
  tshirts: "T-Shirts",
  tshirt: "T-Shirts",
  shirts: "Shirts",
  trousers: "Trousers",
  ethnicwear: "Ethnic Wear",
  sweatshirts: "Sweatshirts",
  kurtas: "Kurtas",
  kurtasandkurtis: "Kurtas & Kurtis",
  sarees: "Sarees",
  dresses: "Dresses",
  activewear: "Activewear",
  tops: "Tops",
  clothing: "Clothing",
  jeans: "Jeans",
  levisjeans: "Jeans",
  perfume: "Perfume",
  perfumes: "Perfume",
  serumandgel: "Serum",
  serum: "Serum",
  lipsticks: "Lipstick",
  lipstick: "Lipstick",
  eyeliners: "Eyeliner",
  foundations: "Foundation",
  sunscreens: "Sunscreen",
  facewash: "Face Wash",
  facewashes: "Face Wash",
  // Our travel-backpack importer wrote the group name as the category, and
  // "Backpacks" is not a leaf — every row under it is an outdoor rucksack.
  backpacks: "Travel Backpacks",
  backpacksandbags: "Backpacks",
  sunglasses: "Sunglasses",
  earbuds: "Earbuds",
  inear: "In-Ear",
  overear: "Over-Ear",
  headphones: "Headphones",
  speakers: "Speakers",
  bluetoothspeakers: "Bluetooth Speakers",
  televisions: "Televisions",
  tvs: "Televisions",
  smarttvs: "Televisions",
  tablets: "Tablets",
  laptops: "Laptops",
  traditional: "Traditional Laptops",
  traditionallaptops: "Traditional Laptops",
  samsunglaptops: "Laptops",
  applelaptops: "Laptops",
  lenovolaptops: "Laptops",
  allinonepcs: "All in One PCs",
  computersandaccessories: "Computers & Accessories",
  powerbanks: "Power Banks",
  wallchargers: "Chargers",
  chargers: "Chargers",
  gaming: "Gaming Consoles",
  playstation: "Gaming Consoles",
  xbox: "Gaming Consoles",
  nintendo: "Gaming Consoles",
  bags: "Bags",
  backpacksands: "Backpacks",
  airfryers: "Air Fryers",
  refrigerators: "Refrigerators",
  washingmachines: "Washing Machines",
  mixers: "Mixer Grinders",
  mixergrinders: "Mixer Grinders",
  inductioncooktops: "Induction Cooktops",
  furniture: "Furniture",
  sofas: "Sofas",
  chairs: "Chairs",
  tables: "Tables",
  decor: "Wall Decor",
  lamps: "Lamps",
  mattress: "Mattresses",
  mattresses: "Mattresses",
  bedding: "Bed Sheets",
  cookware: "Cookware",
  appliance: "Home Appliances",
  homeappliances: "Home Appliances",
  pet: "Pet Food",
  toys: "Toys & Games",
  books: "Books",
  stationery: "Office Supplies",
  travel: "Travel & Luggage",
  luggage: "Luggage",
};

/** Resolve one raw store category to a taxonomy leaf name, if we can. */
export function resolveLeaf(category: string | null): string | null {
  if (!category) return null;
  const n = norm(category);
  if (!n) return null;

  const alias = ALIASES[n];
  if (alias) return alias;

  // 1. Exact. This has to be its own pass. When everything lived in one loop,
  //    the first leaf that merely *contained* the name won, so "Fitness" was
  //    filed under "Fitness Bands" and "Audio" under "Audio Interfaces" even
  //    though both are leaves in their own right.
  for (const leaf of ALL_LEAVES) if (norm(leaf) === n) return leaf;

  // 2. Whole-word containment, either direction, best score wins. Working in
  //    words instead of joined letters is what stops "Cups & Mugs" from
  //    matching "UPS" (c|UPS|and|mugs) and "Other" from matching
  //    "Motherboards" (m|OTHER|boards) — the two ways the old test served a
  //    mug on the power-supply shelf.
  const cw = words(category);
  let best: { leaf: string; score: number } | null = null;
  for (const leaf of ALL_LEAVES) {
    const lw = words(leaf);
    const leafIn = lw.filter((w) => cw.includes(w)).length;
    const catIn = cw.filter((w) => lw.includes(w)).length;
    let score = 0;
    if (leafIn === lw.length) score = 200 + leafIn * 2 - cw.length; // leaf ⊆ category
    else if (catIn === cw.length) score = 150 + catIn; // category ⊆ leaf
    if (score > (best?.score ?? 0)) best = { leaf, score };
  }
  if (best) return best.leaf;

  // 3. Letter-prefix, for the singular/plural and one-word-vs-two cases the
  //    word pass cannot see: "traditionallaptops" → "Traditional Laptops".
  //    Restricted to a prefix of at least six letters so short leaves such as
  //    "ram", "ups" or "tv" cannot reach into an unrelated word again.
  for (const leaf of ALL_LEAVES) {
    const ln = norm(leaf);
    if (ln.length >= 6 && n.startsWith(ln)) return leaf;
    if (n.length >= 6 && ln.startsWith(n)) return leaf;
  }
  return null;
}

/** The umbrella a raw store category belongs to. */
export function groupForCategory(category: string | null): TaxonomyGroup | null {
  const leaf = resolveLeaf(category);
  if (!leaf) return null;
  const ln = norm(leaf);
  for (const g of TAXONOMY) {
    for (const c of g.children) {
      for (const leaf2 of c.leaves) {
        if (norm(leaf2) === ln) return g;
      }
    }
  }
  return null;
}

/* ==================================================================
   Public API
   ================================================================== */

export interface CategoryChild {
  name: string;
  count: number;
  leaves: { name: string; count: number }[];
}

export interface CategoryGroup {
  slug: string;
  name: string;
  icon: string;
  description: string;
  count: number;
  children: CategoryChild[];
}

/**
 * Every umbrella in the taxonomy, whether or not we track products in it
 * yet — so the categories page shows the whole map. Counts are the number of
 * catalogue listings we actually track.
 */
export async function getCategoryGroups(): Promise<CategoryGroup[]> {
  await ensureSchema();

  const rows = await db
    .select({ category: products.category, count: sql<number>`count(*)` })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .where(and(isNotNull(listings.price), isNotNull(products.category)))
    .groupBy(products.category);

  // category -> how many listings we track
  const byCategory = new Map<string, number>();
  for (const r of rows) {
    const c = (r.category ?? "").trim();
    if (!c) continue;
    byCategory.set(c, (byCategory.get(c) ?? 0) + r.count);
  }

  // leaf -> count, for every leaf we can place
  const leafCounts = new Map<string, number>();
  for (const [category, count] of byCategory) {
    const leaf = resolveLeaf(category);
    if (!leaf) continue;
    leafCounts.set(leaf, (leafCounts.get(leaf) ?? 0) + count);
  }

  return TAXONOMY.map((g) => {
    const children: CategoryChild[] = g.children.map((c) => ({
      name: c.name,
      count: c.leaves.reduce((sum, l) => sum + (leafCounts.get(l) ?? 0), 0),
      leaves: c.leaves.map((l) => ({ name: l, count: leafCounts.get(l) ?? 0 })),
    }));
    return {
      slug: g.slug,
      name: g.name,
      icon: g.icon,
      description: g.description,
      count: children.reduce((sum, c) => sum + c.count, 0),
      children,
    };
  });
}

/** Popular search chips for the categories page. */
export async function getPopularSearches(): Promise<string[]> {
  const groups = await getCategoryGroups();
  const out: string[] = [];
  for (const g of groups) {
    for (const c of g.children) {
      for (const l of c.leaves) {
        if (l.count > 0 && out.length < 12) out.push(l.name);
      }
    }
  }
  return out;
}
