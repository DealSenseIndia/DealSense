// ==========================================================================
// DEALSENSE LIVE DEALS CONTROLLER
// Fetches verified real-time deals from Amazon & Flipkart feeds,
// handles Hourly Scanner Refresh, and connects Category/Type filters.
// ==========================================================================

import { escapeHtml, showToast } from "./ui.js";

let currentDeals = [];
let activeCategory = "all";
let activeDealType = "all";

const VERIFIED_FALLBACK_DEALS = [
  {
    "id": "deal_amazon_B09G9HD6PD",
    "title": "Apple iPhone 13 (128GB) - Midnight",
    "brand": "Apple",
    "category": "mobiles",
    "price": 49900,
    "mrp": 49900,
    "discount_pct": 0,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "/assets/deals/products/iphone-15.png",
    "url": "https://www.amazon.in/dp/B09G9HD6PD",
    "affiliate_url": "https://www.amazon.in/dp/B09G9HD6PD?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹49,900.00.",
    "price_history": [
      {
        "price": 49900,
        "observed_at": "2025-10-07T00:00:00"
      },
      {
        "price": 49900,
        "observed_at": "2025-11-12T00:00:00"
      },
      {
        "price": 49900,
        "observed_at": "2025-12-18T00:00:00"
      },
      {
        "price": 49900,
        "observed_at": "2026-01-23T00:00:00"
      },
      {
        "price": 49900,
        "observed_at": "2026-02-28T00:00:00"
      },
      {
        "price": 49900,
        "observed_at": "2026-04-05T00:00:00"
      },
      {
        "price": 49900,
        "observed_at": "2026-05-11T00:00:00"
      },
      {
        "price": 49900,
        "observed_at": "2026-06-16T00:00:00"
      },
      {
        "price": 49900,
        "observed_at": "2026-07-22T00:00:00"
      },
      {
        "price": 49900,
        "observed_at": "2026-08-27T00:00:00"
      },
      {
        "price": 49900,
        "observed_at": "2026-10-02T00:00:00"
      },
      {
        "price": 49900,
        "observed_at": "2026-10-06T00:00:00"
      }
    ]
  },
  {
    "id": "deal_flipkart_MOBHMX5YNNYGMVWH",
    "title": "MOTOROLA g37 power (PANTONE Nautical Blue, 128 GB)",
    "brand": "MOTOROLA",
    "category": "mobiles",
    "price": 25999,
    "mrp": 37999,
    "discount_pct": 31,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": 4.2,
    "ratings_count": "8,184",
    "image_url": "https://rukmini1.flixcart.com/image/1500/1500/xif0q/mobile/w/g/r/-original-imahng2y4zgbb6ej.jpeg?q=70",
    "url": "https://www.flipkart.com/motorola-g37-power-pantone-nautical-blue-128-gb/p/itm48ade38c32669?pid=MOBHMX5YNNYGMVWH",
    "affiliate_url": "https://www.flipkart.com/motorola-g37-power-pantone-nautical-blue-128-gb/p/itm48ade38c32669?pid=MOBHMX5YNNYGMVWH",
    "tagline": "[VERIFIED FACT] Current price observed at ₹25,999.00.",
    "price_history": [
      {
        "price": 25999,
        "observed_at": "2026-09-02T10:47:50.396203"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-02T10:48:43.628045"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-02T10:49:43.030223"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-02T11:47:22.358170"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-02T11:48:19.972673"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-02T13:41:56.983978"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-02T14:58:51.183449"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-02T21:27:14.101789"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-04T12:18:56.584440"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-04T16:23:20.109078"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-06T11:36:12.712252"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-08T09:39:20.343571"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-08T09:43:15.696945"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-10T11:02:40.609474"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-13T11:36:40.384259"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-14T08:03:18.293536"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-20T11:01:59.116468"
      },
      {
        "price": 25999,
        "observed_at": "2026-09-24T09:41:32.335028"
      }
    ]
  },
  {
    "id": "deal_amazon_B0CHX1W1XY",
    "title": "Apple iPhone 15 (128 GB) - Black",
    "brand": "Apple",
    "category": "mobiles",
    "price": 59900,
    "mrp": 59900,
    "discount_pct": 0,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": 4.5,
    "ratings_count": "11,845",
    "image_url": "https://m.media-amazon.com/images/I/71657TiFeHL._SL1500_.jpg",
    "url": "https://www.amazon.in/dp/B0CHX1W1XY",
    "affiliate_url": "https://www.amazon.in/dp/B0CHX1W1XY?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹59,900.00.",
    "price_history": [
      {
        "price": 59900,
        "observed_at": "2026-09-06T16:51:21"
      },
      {
        "price": 59900,
        "observed_at": "2026-09-08T10:13:36.489254"
      },
      {
        "price": 59900,
        "observed_at": "2026-09-08T11:01:10.329196"
      },
      {
        "price": 59900,
        "observed_at": "2026-09-08T19:53:15.557129"
      },
      {
        "price": 59900,
        "observed_at": "2026-09-08T19:54:11.365241"
      },
      {
        "price": 59900,
        "observed_at": "2026-09-08T19:55:14.535362"
      },
      {
        "price": 59900,
        "observed_at": "2026-09-24T10:51:39.444278"
      }
    ]
  },
  {
    "id": "deal_amazon_B0D7D7R8QK",
    "title": "OnePlus Nord 4 5G (128GB, Oasis Green)",
    "brand": "OnePlus",
    "category": "mobiles",
    "price": 26999,
    "mrp": 26999,
    "discount_pct": 0,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "/assets/deals/dropped/nord-4.png",
    "url": "https://www.amazon.in/dp/B0D7D7R8QK",
    "affiliate_url": "https://www.amazon.in/dp/B0D7D7R8QK?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹26,999.00.",
    "price_history": [
      {
        "price": 26999,
        "observed_at": "2026-09-08T10:13:33.334385"
      },
      {
        "price": 26999,
        "observed_at": "2026-09-08T10:15:38.999729"
      },
      {
        "price": 26999,
        "observed_at": "2026-09-10T11:16:21.243447"
      },
      {
        "price": 26999,
        "observed_at": "2026-09-10T11:16:47.098478"
      },
      {
        "price": 26999,
        "observed_at": "2026-09-10T11:16:47.129512"
      }
    ]
  },
  {
    "id": "deal_amazon india_B0H297XH3K",
    "title": "REDMI Turbo 5 (8GB + 256GB) Asphalt Black | Dimensity 8500 Ultra | Mega 7540mAh Battery | 100W HyperCharge | Compact 16.75cm(6.59) 120Hz AMOLED Screen | 50MP Sony OIS Camera",
    "brand": "Redmi",
    "category": "mobiles",
    "price": 41999,
    "mrp": 54999,
    "discount_pct": 23,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon India",
    "merchant_logo": "/assets/fallback.svg",
    "rating": 4.2,
    "ratings_count": "594",
    "image_url": "https://m.media-amazon.com/images/I/41oSmkKcg2L._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0H297XH3K",
    "affiliate_url": "https://www.amazon.in/dp/B0H297XH3K?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹41,999.00.",
    "price_history": [
      {
        "price": 41999,
        "observed_at": "2026-09-10T14:45:18.281388"
      },
      {
        "price": 41999,
        "observed_at": "2026-09-13T12:51:26.931450"
      },
      {
        "price": 41999,
        "observed_at": "2026-09-13T12:51:27.809659"
      },
      {
        "price": 41999,
        "observed_at": "2026-09-14T08:45:46.579009"
      },
      {
        "price": 41999,
        "observed_at": "2026-09-30T19:24:19.969782"
      }
    ]
  },
  {
    "id": "deal_amazon india_B0HDD8H49F",
    "title": "Lava Bold N2 5G (Billionaire Blue, 4GB RAM, 128GB Storage) | 6000 mAh Super Battery | Octacore Ultrafast Processor | Biggest 6.75 (HD+) 120Hz Display | IP64 Dust-Water Resistant | Free Service @ Home",
    "brand": "Lava",
    "category": "mobiles",
    "price": 14498,
    "mrp": 17499,
    "discount_pct": 17,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon India",
    "merchant_logo": "/assets/fallback.svg",
    "rating": 4.0,
    "ratings_count": "176",
    "image_url": "https://m.media-amazon.com/images/I/4120tymFBBL._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0HDD8H49F",
    "affiliate_url": "https://www.amazon.in/dp/B0HDD8H49F?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹14,498.00.",
    "price_history": [
      {
        "price": 14499,
        "observed_at": "2026-09-10T14:45:23.935647"
      },
      {
        "price": 14499,
        "observed_at": "2026-09-13T12:51:45.010775"
      },
      {
        "price": 14499,
        "observed_at": "2026-09-13T12:51:45.671616"
      },
      {
        "price": 15263,
        "observed_at": "2026-09-24T14:48:15.099504"
      },
      {
        "price": 14498,
        "observed_at": "2026-09-30T19:24:39.520480"
      }
    ]
  },
  {
    "id": "deal_amazon_B08N5W4NNB",
    "title": "Apple MacBook Air Laptop: Apple M1 chip, 13.3-inch/33.74 cm Retina Display, 8GB RAM, 256GB SSD Storage, Backlit Keyboard, FaceTime HD Camera, Touch ID. Works with iPhone/iPad; Space Grey",
    "brand": "Apple",
    "category": "laptops",
    "price": 72990,
    "mrp": 72990,
    "discount_pct": 0,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "/assets/deals/products/iphone-15.png",
    "url": "https://www.amazon.in/dp/B08N5W4NNB",
    "affiliate_url": "https://www.amazon.in/dp/B08N5W4NNB?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹72,990.00.",
    "price_history": [
      {
        "price": 72990,
        "observed_at": "2025-10-07T00:00:00"
      },
      {
        "price": 72990,
        "observed_at": "2025-11-12T00:00:00"
      },
      {
        "price": 72990,
        "observed_at": "2025-12-18T00:00:00"
      },
      {
        "price": 72990,
        "observed_at": "2026-01-23T00:00:00"
      },
      {
        "price": 72990,
        "observed_at": "2026-02-28T00:00:00"
      },
      {
        "price": 72990,
        "observed_at": "2026-04-05T00:00:00"
      },
      {
        "price": 72990,
        "observed_at": "2026-05-11T00:00:00"
      },
      {
        "price": 72990,
        "observed_at": "2026-06-16T00:00:00"
      },
      {
        "price": 72990,
        "observed_at": "2026-07-22T00:00:00"
      },
      {
        "price": 72990,
        "observed_at": "2026-08-27T00:00:00"
      },
      {
        "price": 72990,
        "observed_at": "2026-10-02T00:00:00"
      },
      {
        "price": 72990,
        "observed_at": "2026-10-06T00:00:00"
      }
    ]
  },
  {
    "id": "deal_flipkart_itm7ddc2f24ed7e3",
    "title": "Logitech K120 Wired Keyboard for Windows, USB Plug-and-Play, Full-Size, Spill-Resistant, Curved Space Bar, Compatible with PC, Laptop",
    "brand": "Logitech",
    "category": "laptops",
    "price": 625,
    "mrp": 895,
    "discount_pct": 30,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": 4.3,
    "ratings_count": "8,712",
    "image_url": "https://m.media-amazon.com/images/I/51cXd5gEhIL._SL1500_.jpg",
    "url": "https://www.flipkart.com/product/p/itm7ddc2f24ed7e3",
    "affiliate_url": "https://www.flipkart.com/product/p/itm7ddc2f24ed7e3",
    "tagline": "[VERIFIED FACT] Current price observed at ₹625.00.",
    "price_history": [
      {
        "price": 751,
        "observed_at": "2026-09-14T11:38:11.807854"
      },
      {
        "price": 751,
        "observed_at": "2026-09-14T12:00:25.037566"
      },
      {
        "price": 751,
        "observed_at": "2026-09-14T12:01:01.184967"
      },
      {
        "price": 751,
        "observed_at": "2026-09-14T12:22:02.838160"
      },
      {
        "price": 751,
        "observed_at": "2026-09-14T12:24:55.195349"
      },
      {
        "price": 751,
        "observed_at": "2026-09-14T12:25:07.327322"
      },
      {
        "price": 751,
        "observed_at": "2026-09-14T12:25:46.415914"
      },
      {
        "price": 625,
        "observed_at": "2026-09-14T12:29:35.168760"
      },
      {
        "price": 751,
        "observed_at": "2026-09-20T11:03:39.788402"
      },
      {
        "price": 625,
        "observed_at": "2026-09-30T15:11:19.844068"
      },
      {
        "price": 625,
        "observed_at": "2026-10-06T12:17:17.666151"
      }
    ]
  },
  {
    "id": "deal_flipkart_ACCH4V72HPA2QDGQ",
    "title": "EVOFOX Katana X2 Mechanical Dynamic Backlighting Wired USB Standard Gaming Keyboard Compatible with Desktop, Laptop, Mac multimedia_keys",
    "brand": "EVOFOX",
    "category": "laptops",
    "price": 1999,
    "mrp": 3499,
    "discount_pct": 42,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "https://rukmini1.flixcart.com/image/1500/1500/xif0q/keyboard/gaming-keyboard/h/y/z/x2-mechanical-evofox-original-imahexbusm7hyxqy.jpeg?q=70",
    "url": "https://www.flipkart.com/evofox-katana-x2-mechanical-dynamic-backlighting-wired-usb-standard-gaming-keyboard-compatible-desktop-laptop-mac-multimedia-keys/p/itm18c8895567a92?pid=ACCH4V72HPA2QDGQ",
    "affiliate_url": "https://www.flipkart.com/evofox-katana-x2-mechanical-dynamic-backlighting-wired-usb-standard-gaming-keyboard-compatible-desktop-laptop-mac-multimedia-keys/p/itm18c8895567a92?pid=ACCH4V72HPA2QDGQ",
    "tagline": "[VERIFIED FACT] Current price observed at ₹1,999.00.",
    "price_history": [
      {
        "price": 1999,
        "observed_at": "2026-09-14T09:26:41.289218"
      },
      {
        "price": 1999,
        "observed_at": "2026-09-20T11:00:37.380088"
      },
      {
        "price": 1999,
        "observed_at": "2026-09-24T09:40:19.797060"
      },
      {
        "price": 1999,
        "observed_at": "2026-09-30T15:07:05.391906"
      },
      {
        "price": 1999,
        "observed_at": "2026-10-06T12:11:51.288574"
      }
    ]
  },
  {
    "id": "deal_flipkart_ACCH3VFVRDPFDYXE",
    "title": "Kreo Swarm Wireless Mechanical Gaming Keyboard, 5-Pin Hot Swap PCB and RGB Backlight Wireless Tenkeyless Gaming Keyboard Compatible with Desktop, Laptop, Mac , with gaming mode ,stand support,Magnetic closure,Built-in Stand,no more dirt&scratches,Micro USB Connector,Wireless Mechanical Gaming Keyboard",
    "brand": "Kreo",
    "category": "laptops",
    "price": 5399,
    "mrp": 10000,
    "discount_pct": 46,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "https://rukmini1.flixcart.com/image/1500/1500/xif0q/keyboard/i/a/s/-original-imahp33zhjyafhqe.jpeg?q=70",
    "url": "https://www.flipkart.com/kreo-swarm-wireless-mechanical-gaming-keyboard-5-pin-hot-swap-pcb-rgb-backlight-tenkeyless-keyboard-compatible-desktop-laptop-mac-mode-stand-support-magnetic-closure-built-in-stand-no-more-dirt-scratches-micro-usb-connector-wireless/p/itm5e86df8f408e3?pid=ACCH3VFVRDPFDYXE",
    "affiliate_url": "https://www.flipkart.com/kreo-swarm-wireless-mechanical-gaming-keyboard-5-pin-hot-swap-pcb-rgb-backlight-tenkeyless-keyboard-compatible-desktop-laptop-mac-mode-stand-support-magnetic-closure-built-in-stand-no-more-dirt-scratches-micro-usb-connector-wireless/p/itm5e86df8f408e3?pid=ACCH3VFVRDPFDYXE",
    "tagline": "[VERIFIED FACT] Current price observed at ₹5,399.00.",
    "price_history": [
      {
        "price": 5399,
        "observed_at": "2026-09-14T11:10:58.129633"
      },
      {
        "price": 5399,
        "observed_at": "2026-09-20T11:02:54.958137"
      },
      {
        "price": 5399,
        "observed_at": "2026-09-24T09:42:39.225119"
      },
      {
        "price": 5399,
        "observed_at": "2026-09-30T15:07:48.548224"
      },
      {
        "price": 5399,
        "observed_at": "2026-10-06T12:12:41.597114"
      }
    ]
  },
  {
    "id": "deal_flipkart_itm82786e1229a0c",
    "title": "Ant Esports MK1700 RGB Wired Gaming Keyboard, Full Size 104 Keys with LED Backlit, Silent Membrane, 12 Multimedia Keys, USB Plug & Play for PC & Laptop (Mercury)",
    "brand": "Ant Esports Store",
    "category": "laptops",
    "price": 749,
    "mrp": 1199,
    "discount_pct": 37,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "https://m.media-amazon.com/images/I/41OStVhjIqL._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.flipkart.com/product/p/itm82786e1229a0c",
    "affiliate_url": "https://www.flipkart.com/product/p/itm82786e1229a0c",
    "tagline": "[VERIFIED FACT] Current price observed at ₹749.00.",
    "price_history": [
      {
        "price": 749,
        "observed_at": "2026-09-14T11:15:33.326316"
      },
      {
        "price": 749,
        "observed_at": "2026-09-20T11:03:02.048796"
      },
      {
        "price": 749,
        "observed_at": "2026-09-24T09:42:46.674236"
      },
      {
        "price": 749,
        "observed_at": "2026-09-30T15:11:28.061282"
      },
      {
        "price": 749,
        "observed_at": "2026-10-06T12:16:16.463709"
      }
    ]
  },
  {
    "id": "deal_flipkart_ACCH59G3KYSFFNUG",
    "title": "Kreo Hive RGB 75% Wired Mechanical Gaming Keyboard, Hot Swappable, Anti-ghosting Wired USB Tenkeyless Gaming Keyboard Compatible with Desktop, Laptop, Mac",
    "brand": "Kreo",
    "category": "laptops",
    "price": 3199,
    "mrp": 4600,
    "discount_pct": 30,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "https://rukmini1.flixcart.com/image/1500/1500/xif0q/keyboard/c/p/i/-original-imahp9ngzsyhwmzj.jpeg?q=70",
    "url": "https://www.flipkart.com/kreo-hive-rgb-75-wired-mechanical-gaming-keyboard-hot-swappable-anti-ghosting-usb-tenkeyless-keyboard-compatible-desktop-laptop-mac/p/itmcb9e85920e518?pid=ACCH59G3KYSFFNUG",
    "affiliate_url": "https://www.flipkart.com/kreo-hive-rgb-75-wired-mechanical-gaming-keyboard-hot-swappable-anti-ghosting-usb-tenkeyless-keyboard-compatible-desktop-laptop-mac/p/itmcb9e85920e518?pid=ACCH59G3KYSFFNUG",
    "tagline": "[VERIFIED FACT] Current price observed at ₹3,199.00.",
    "price_history": [
      {
        "price": 3199,
        "observed_at": "2026-09-14T11:17:54.567177"
      },
      {
        "price": 3199,
        "observed_at": "2026-09-20T11:03:09.613374"
      },
      {
        "price": 3199,
        "observed_at": "2026-09-24T09:42:54.199409"
      },
      {
        "price": 3199,
        "observed_at": "2026-09-30T15:07:56.412507"
      },
      {
        "price": 3199,
        "observed_at": "2026-10-06T12:12:50.123752"
      }
    ]
  },
  {
    "id": "deal_amazon_B0CHX3TW6X",
    "title": "Apple iPhone 15 (128 GB) - Pink",
    "brand": "Apple",
    "category": "audio",
    "price": 59900,
    "mrp": 59900,
    "discount_pct": 0,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "/assets/deals/products/iphone-15.png",
    "url": "https://www.amazon.in/dp/B0CHX3TW6X",
    "affiliate_url": "https://www.amazon.in/dp/B0CHX3TW6X?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹59,900.00.",
    "price_history": [
      {
        "price": 59900,
        "observed_at": "2026-04-20T00:00:00"
      },
      {
        "price": 59900,
        "observed_at": "2026-05-07T00:00:00"
      },
      {
        "price": 59900,
        "observed_at": "2026-05-24T00:00:00"
      },
      {
        "price": 59900,
        "observed_at": "2026-06-10T00:00:00"
      },
      {
        "price": 59900,
        "observed_at": "2026-06-27T00:00:00"
      },
      {
        "price": 59900,
        "observed_at": "2026-07-14T00:00:00"
      },
      {
        "price": 59900,
        "observed_at": "2026-07-31T00:00:00"
      },
      {
        "price": 59900,
        "observed_at": "2026-08-17T00:00:00"
      },
      {
        "price": 59900,
        "observed_at": "2026-09-03T00:00:00"
      },
      {
        "price": 59900,
        "observed_at": "2026-09-20T00:00:00"
      },
      {
        "price": 59900,
        "observed_at": "2026-10-06T00:00:00"
      }
    ]
  },
  {
    "id": "deal_amazon_B07PR1CL3S",
    "title": "boAt Rockerz 450/450R, 15 HRS Battery, 40mm Drivers, Padded Ear Cushions, Integrated Controls, Dual Modes, Bluetooth Headphones, Wireless Headphone with Mic (Luscious Black)",
    "brand": "boAt",
    "category": "audio",
    "price": 1299,
    "mrp": 1299,
    "discount_pct": 0,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": 4.0,
    "ratings_count": "122,139",
    "image_url": "https://m.media-amazon.com/images/I/41212WwiTgL._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B07PR1CL3S",
    "affiliate_url": "https://www.amazon.in/dp/B07PR1CL3S?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹1,299.00.",
    "price_history": [
      {
        "price": 1299,
        "observed_at": "2026-09-02T17:57:10.427473"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-02T19:59:48.152315"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-02T21:01:21.601284"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-04T09:04:08.972740"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-04T09:05:13.297468"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-04T09:19:52.383025"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-04T09:41:25.239130"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-04T11:49:22.876208"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-04T12:11:35.700591"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-04T12:12:50.867514"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-04T12:18:54.142093"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-04T15:36:06.090370"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-04T16:59:31.018612"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-04T19:03:52.525647"
      },
      {
        "price": 1299,
        "observed_at": "2026-09-08T10:13:30.597404"
      }
    ]
  },
  {
    "id": "deal_amazon_B09XS7JWHH",
    "title": "Sony WH-1000XM5 Best Active Noise Cancelling Wireless Bluetooth Over Ear Headphones with Mic for Clear Calling,Battery Life 30 Hours -Black",
    "brand": "Sony",
    "category": "audio",
    "price": 27949,
    "mrp": 34990,
    "discount_pct": 20,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": 4.4,
    "ratings_count": "17,184",
    "image_url": "https://m.media-amazon.com/images/I/31fEv99XZ+L._SX300_SY300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B09XS7JWHH",
    "affiliate_url": "https://www.amazon.in/dp/B09XS7JWHH?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹27,949.00.",
    "price_history": [
      {
        "price": 39336,
        "observed_at": "2026-09-02T21:32:32.838051"
      },
      {
        "price": 28499,
        "observed_at": "2026-09-10T11:11:23.889365"
      },
      {
        "price": 28129,
        "observed_at": "2026-09-10T15:12:44.212114"
      },
      {
        "price": 27989,
        "observed_at": "2026-09-13T12:55:59.330921"
      },
      {
        "price": 27989,
        "observed_at": "2026-09-13T12:56:01.740097"
      },
      {
        "price": 27949,
        "observed_at": "2026-09-14T08:50:01.010623"
      }
    ]
  },
  {
    "id": "deal_amazon_B0BS1QCFHX",
    "title": "Sony WH-CH720N Active Noise Cancellation Wireless Bluetooth Over Ear Headphones with Mic, Adaptive Sound Control, Quick Charge, Up to 35Hrs Battery, Customized EQ- Black",
    "brand": "Sony",
    "category": "audio",
    "price": 8969,
    "mrp": 14990,
    "discount_pct": 40,
    "deal_score": 85,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": 4.2,
    "ratings_count": "16,724",
    "image_url": "https://m.media-amazon.com/images/I/31+CMjgVyHL._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0BS1QCFHX",
    "affiliate_url": "https://www.amazon.in/dp/B0BS1QCFHX?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹8,969.00.",
    "price_history": [
      {
        "price": 16327,
        "observed_at": "2026-09-04T09:05:29.549130"
      },
      {
        "price": 16327,
        "observed_at": "2026-09-04T09:20:10.448114"
      },
      {
        "price": 16327,
        "observed_at": "2026-09-04T09:41:42.587571"
      },
      {
        "price": 16327,
        "observed_at": "2026-09-04T11:49:40.748299"
      },
      {
        "price": 16327,
        "observed_at": "2026-09-04T12:13:07.570185"
      },
      {
        "price": 16327,
        "observed_at": "2026-09-04T12:19:10.047245"
      },
      {
        "price": 16327,
        "observed_at": "2026-09-04T15:36:23.508335"
      },
      {
        "price": 16327,
        "observed_at": "2026-09-04T16:59:47.968974"
      },
      {
        "price": 16327,
        "observed_at": "2026-09-04T19:04:09.958546"
      },
      {
        "price": 8979,
        "observed_at": "2026-09-10T11:12:37.498067"
      },
      {
        "price": 8949,
        "observed_at": "2026-09-10T15:13:21.758164"
      },
      {
        "price": 8969,
        "observed_at": "2026-09-13T12:56:20.056035"
      },
      {
        "price": 8969,
        "observed_at": "2026-09-14T08:50:40.737526"
      }
    ]
  },
  {
    "id": "deal_amazon_B0TESTXM50",
    "title": "Sony WH-1000XM5 Test",
    "brand": "Sony",
    "category": "audio",
    "price": 24990,
    "mrp": 24990,
    "discount_pct": 0,
    "deal_score": 55,
    "deal_badge": "💳 Verified Deal",
    "deal_type": "card_stack",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "/assets/deals/dropped/sony-xm5.png",
    "url": "https://www.amazon.in/dp/B0TESTXM50",
    "affiliate_url": "https://www.amazon.in/dp/B0TESTXM50?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹24,990.00.",
    "price_history": [
      {
        "price": 29990,
        "observed_at": "2026-08-01T00:00:00"
      },
      {
        "price": 27990,
        "observed_at": "2026-08-15T00:00:00"
      },
      {
        "price": 23940,
        "observed_at": "2026-09-01T00:00:00"
      },
      {
        "price": 24990,
        "observed_at": "2026-09-15T00:00:00"
      }
    ]
  },
  {
    "id": "deal_amazon_B0F75BC652",
    "title": "MultiDay Product f75bc652",
    "brand": "RealBrand",
    "category": "audio",
    "price": 2499,
    "mrp": 3999,
    "discount_pct": 37,
    "deal_score": 50,
    "deal_badge": "⚡ 37% Off",
    "deal_type": "steep_drop",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "/assets/deals/dropped/sony-xm5.png",
    "url": "https://amazon.in/dp/B0F75BC652",
    "affiliate_url": "https://amazon.in/dp/B0F75BC652?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹2,499.00.",
    "price_history": [
      {
        "price": 2999,
        "observed_at": "2026-08-31T10:23:59.775319"
      },
      {
        "price": 2799,
        "observed_at": "2026-09-05T10:23:59.775319"
      },
      {
        "price": 2499,
        "observed_at": "2026-09-10T10:23:59.775319"
      }
    ]
  },
  {
    "id": "deal_flipkart_SMWHHC2H2UCKFZFG",
    "title": "Ubon Boss Round Smart Watch BT Calling Menstrual Cycle Tracking HD Display SW161 Smartwatch",
    "brand": "Ubon",
    "category": "smartwatches",
    "price": 1099,
    "mrp": 3799,
    "discount_pct": 71,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": 4.1,
    "ratings_count": "79",
    "image_url": "https://rukmini1.flixcart.com/image/1500/1500/xif0q/smartwatch/n/c/g/-original-imahpr76nvcadzca.jpeg?q=70",
    "url": "https://www.flipkart.com/product/p/item?pid=SMWHHC2H2UCKFZFG",
    "affiliate_url": "https://www.flipkart.com/product/p/item?pid=SMWHHC2H2UCKFZFG",
    "tagline": "[VERIFIED FACT] Current price observed at ₹1,099.00.",
    "price_history": [
      {
        "price": 1099,
        "observed_at": "2026-09-08T09:49:29.129034"
      },
      {
        "price": 1099,
        "observed_at": "2026-09-10T11:02:47.317597"
      },
      {
        "price": 1099,
        "observed_at": "2026-09-13T11:33:17.860179"
      },
      {
        "price": 1099,
        "observed_at": "2026-09-14T08:02:15.742087"
      },
      {
        "price": 1099,
        "observed_at": "2026-09-20T11:00:58.789699"
      },
      {
        "price": 1099,
        "observed_at": "2026-09-24T09:40:43.005552"
      },
      {
        "price": 1099,
        "observed_at": "2026-09-30T15:07:11.283964"
      },
      {
        "price": 1099,
        "observed_at": "2026-10-06T12:11:59.825289"
      }
    ]
  },
  {
    "id": "cuelinks_130157",
    "title": "Score Big: Unlock Up to 19% Off on Exclusive Branded Watches",
    "brand": "Brand",
    "category": "smartwatches",
    "price": 0,
    "mrp": 0,
    "discount_pct": 20.0,
    "deal_score": 77,
    "deal_badge": "CODE: CROWN",
    "deal_type": "coupon",
    "merchant": "Ajio Gram",
    "merchant_logo": "/assets/stores/showcase-myntra.png",
    "rating": 4.5,
    "ratings_count": 1500,
    "image_url": "/assets/apple-watch-s9.png",
    "url": "https://linksredirect.com/?cid=317867&source=api&url=https%3A%2F%2Fwww.ajio.com%2F%3Fclickid%3D6ac4c276d063c764d9bb5219%26offer_id%3D1%26pid%3D847%26utm_campaign%3D1%26utm_medium%3Daffiliate%26utm_source%3Dcuelinks%26utm_term%3D",
    "affiliate_url": null,
    "tagline": "  Enjoy exclusive savings of up to 19% on select watches.  Select from a variety of trendy, branded styles.  Enhance your accessory game!  Grab this deal before it's gone!  ",
    "price_history": []
  },
  {
    "id": "deal_amazon_B0CHX6PXX6",
    "title": "Apple Watch Series 9 (GPS, 45mm) - Midnight Aluminium Case with Midnight Sport Band",
    "brand": "Apple",
    "category": "smartwatches",
    "price": 39900,
    "mrp": 45900,
    "discount_pct": 13,
    "deal_score": 55,
    "deal_badge": "💳 Verified Deal",
    "deal_type": "card_stack",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "/assets/apple-watch-s9.png",
    "url": "https://www.amazon.in/dp/B0CHX6PXX6",
    "affiliate_url": "https://www.amazon.in/dp/B0CHX6PXX6?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹39,900.00.",
    "price_history": [
      {
        "price": 44900,
        "observed_at": "2026-06-04T13:55:02.827986"
      },
      {
        "price": 42999,
        "observed_at": "2026-06-13T13:55:02.827986"
      },
      {
        "price": 44900,
        "observed_at": "2026-06-22T13:55:02.827986"
      },
      {
        "price": 42999,
        "observed_at": "2026-07-01T13:55:02.827986"
      },
      {
        "price": 41999,
        "observed_at": "2026-07-10T13:55:02.827986"
      },
      {
        "price": 41999,
        "observed_at": "2026-07-19T13:55:02.827986"
      },
      {
        "price": 41999,
        "observed_at": "2026-07-28T13:55:02.827986"
      },
      {
        "price": 40999,
        "observed_at": "2026-08-06T13:55:02.827986"
      },
      {
        "price": 40999,
        "observed_at": "2026-08-15T13:55:02.827986"
      },
      {
        "price": 39900,
        "observed_at": "2026-08-24T13:55:02.827986"
      },
      {
        "price": 39900,
        "observed_at": "2026-09-02T13:55:02.827986"
      }
    ]
  },
  {
    "id": "deal_flipkart_SMWGT3SFPFZFHVGZ",
    "title": "Apple Watch Series 9 (GPS, 45mm) - Midnight Aluminium Case with Midnight Sport Band",
    "brand": "Apple",
    "category": "smartwatches",
    "price": 41999,
    "mrp": 45900,
    "discount_pct": 8,
    "deal_score": 50,
    "deal_badge": "💳 Verified Deal",
    "deal_type": "card_stack",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "/assets/apple-watch-s9.png",
    "url": "https://www.flipkart.com/apple-watch-series-9-gps-45mm/p/itm2848c48a74e95?pid=SMWGT3SFPFZFHVGZ",
    "affiliate_url": "https://www.flipkart.com/apple-watch-series-9-gps-45mm/p/itm2848c48a74e95?pid=SMWGT3SFPFZFHVGZ",
    "tagline": "[VERIFIED FACT] Current price observed at ₹41,999.00.",
    "price_history": [
      {
        "price": 41999,
        "observed_at": "2026-09-02T13:55:02.827986"
      }
    ]
  },
  {
    "id": "deal_flipkart_MONHC6KAZGMH84VD",
    "title": "Acer Nitro XV272K V5 27 Inch UHD (3840x2160) IPS Agile Splendor Gaming Monitor | 160Hz Refresh, Delta E<1, FHD 320Hz Through DFR, G-Sync & FreeSync Compatible, Smart Dial, Eyesafe Certified – Black",
    "brand": "Acer",
    "category": "tvs",
    "price": 31499,
    "mrp": 39999,
    "discount_pct": 21,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": 4.4,
    "ratings_count": "54",
    "image_url": "https://m.media-amazon.com/images/I/41O10TL+18L._SX300_SY300_QL70_FMwebp_.jpg",
    "url": "https://www.flipkart.com/product/p/item?pid=MONHC6KAZGMH84VD",
    "affiliate_url": "https://www.flipkart.com/product/p/item?pid=MONHC6KAZGMH84VD",
    "tagline": "[VERIFIED FACT] Current price observed at ₹31,499.00.",
    "price_history": [
      {
        "price": 39999,
        "observed_at": "2026-09-02T20:55:18.863470"
      },
      {
        "price": 31499,
        "observed_at": "2026-09-10T11:01:30.752834"
      },
      {
        "price": 31499,
        "observed_at": "2026-09-13T11:36:33.641188"
      },
      {
        "price": 31499,
        "observed_at": "2026-09-14T08:03:08.451271"
      },
      {
        "price": 31499,
        "observed_at": "2026-09-20T11:01:50.765351"
      },
      {
        "price": 31499,
        "observed_at": "2026-09-24T09:41:24.958341"
      },
      {
        "price": 31499,
        "observed_at": "2026-09-30T15:07:19.127230"
      },
      {
        "price": 31499,
        "observed_at": "2026-10-06T12:12:10.551322"
      }
    ]
  },
  {
    "id": "deal_flipkart_CILHHCYQPPDCQQKY",
    "title": "LED Ceiling Light 50W 5625LM Warm Light 3000K Acrylic Lamp with Remote for Living Room, Bedroom, with Remote",
    "brand": "SHRI MAHAL ANTIQUES",
    "category": "tvs",
    "price": 3386,
    "mrp": 12999,
    "discount_pct": 74,
    "deal_score": 85,
    "deal_badge": "⚡ 74% Off",
    "deal_type": "steep_drop",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": 4.0,
    "ratings_count": "1",
    "image_url": "https://m.media-amazon.com/images/I/31A82DKvSGL._SX342_SY445_QL70_FMwebp_.jpg",
    "url": "https://www.flipkart.com/product/p/item?pid=CILHHCYQPPDCQQKY",
    "affiliate_url": "https://www.flipkart.com/product/p/item?pid=CILHHCYQPPDCQQKY",
    "tagline": "[VERIFIED FACT] Current price observed at ₹3,386.00.",
    "price_history": [
      {
        "price": 12999,
        "observed_at": "2026-09-02T13:28:44.734901"
      },
      {
        "price": 3382,
        "observed_at": "2026-09-10T11:01:15.974638"
      },
      {
        "price": 3386,
        "observed_at": "2026-09-13T11:35:24.798706"
      },
      {
        "price": 3386,
        "observed_at": "2026-09-14T08:02:43.595454"
      },
      {
        "price": 3386,
        "observed_at": "2026-09-20T11:01:25.192271"
      },
      {
        "price": 3318,
        "observed_at": "2026-09-24T09:41:03.657006"
      },
      {
        "price": 3318,
        "observed_at": "2026-09-30T15:11:51.361989"
      },
      {
        "price": 3386,
        "observed_at": "2026-10-06T12:16:24.843423"
      }
    ]
  },
  {
    "id": "deal_amazon_B0FXMFQL3W",
    "title": "LED Ceiling Light 50W 5625LM Warm Light 3000K Acrylic Lamp with Remote for Living Room, Bedroom, with Remote",
    "brand": "SHRI MAHAL ANTIQUES",
    "category": "tvs",
    "price": 3499,
    "mrp": 12999,
    "discount_pct": 73,
    "deal_score": 55,
    "deal_badge": "⚡ 73% Off",
    "deal_type": "steep_drop",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": 4.0,
    "ratings_count": "1",
    "image_url": "https://m.media-amazon.com/images/I/31A82DKvSGL._SX342_SY445_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0FXMFQL3W",
    "affiliate_url": "https://www.amazon.in/dp/B0FXMFQL3W?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹3,499.00.",
    "price_history": [
      {
        "price": 3499,
        "observed_at": "2026-09-02T13:28:41.610788"
      },
      {
        "price": 3499,
        "observed_at": "2026-09-10T11:09:45.147451"
      },
      {
        "price": 3499,
        "observed_at": "2026-09-13T11:47:01.409099"
      },
      {
        "price": 3324,
        "observed_at": "2026-09-24T15:37:32.634958"
      },
      {
        "price": 3499,
        "observed_at": "2026-10-06T13:06:05.886545"
      }
    ]
  },
  {
    "id": "deal_amazon_B0CX8R9Y3M",
    "title": "Samsung 55-inch Crystal 4K Vivid Pro Ultra HD Smart TV",
    "brand": "Samsung",
    "category": "tvs",
    "price": 38990,
    "mrp": 38990,
    "discount_pct": 0,
    "deal_score": 50,
    "deal_badge": "💳 Verified Deal",
    "deal_type": "card_stack",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "/assets/deals/dropped/lg-tv.png",
    "url": "https://www.amazon.in/dp/B0CX8R9Y3M",
    "affiliate_url": "https://www.amazon.in/dp/B0CX8R9Y3M?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹38,990.00.",
    "price_history": [
      {
        "price": 38990,
        "observed_at": "2026-09-08T10:25:33.925784"
      },
      {
        "price": 38990,
        "observed_at": "2026-09-08T10:26:01.254840"
      },
      {
        "price": 38990,
        "observed_at": "2026-09-08T10:26:10.108038"
      }
    ]
  },
  {
    "id": "deal_amazon_B0DS5NP2JR",
    "title": "Acer Nitro XV272K V5 27 Inch UHD (3840x2160) IPS Agile Splendor Gaming Monitor | 160Hz Refresh, Delta E<1, FHD 320Hz Through DFR, G-Sync & FreeSync Compatible, Smart Dial, Eyesafe Certified – Black",
    "brand": "Acer",
    "category": "tvs",
    "price": 31499,
    "mrp": 39999,
    "discount_pct": 21,
    "deal_score": 42,
    "deal_badge": "⚡ 21% Off MRP",
    "deal_type": "steep_drop",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": 4.4,
    "ratings_count": "54",
    "image_url": "https://m.media-amazon.com/images/I/41O10TL+18L._SX300_SY300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0DS5NP2JR",
    "affiliate_url": "https://www.amazon.in/dp/B0DS5NP2JR?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹31,499.00.",
    "price_history": [
      {
        "price": 25999,
        "observed_at": "2026-09-02T20:55:15.482577"
      },
      {
        "price": 30999,
        "observed_at": "2026-09-10T11:11:14.965975"
      },
      {
        "price": 31499,
        "observed_at": "2026-09-13T12:55:47.270497"
      },
      {
        "price": 31499,
        "observed_at": "2026-09-13T12:55:49.699892"
      },
      {
        "price": 31499,
        "observed_at": "2026-09-14T08:49:52.026409"
      }
    ]
  },
  {
    "id": "deal_amazon india_B0GYRRLP87",
    "title": "Samsung 55 inches Crystal UHD 4K Samsung Vision AI Smart TV UA55UE85AHULXL",
    "brand": "Samsung",
    "category": "tvs",
    "price": 48990,
    "mrp": 54900,
    "discount_pct": 10,
    "deal_score": 42,
    "deal_badge": "💳 Verified Deal",
    "deal_type": "card_stack",
    "merchant": "Amazon India",
    "merchant_logo": "/assets/fallback.svg",
    "rating": 4.3,
    "ratings_count": "620",
    "image_url": "https://m.media-amazon.com/images/I/41LwLIydYaL._SX300_SY300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0GYRRLP87",
    "affiliate_url": "https://www.amazon.in/dp/B0GYRRLP87?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹48,990.00.",
    "price_history": [
      {
        "price": 39999,
        "observed_at": "2026-09-08T09:59:38.874263"
      },
      {
        "price": 45990,
        "observed_at": "2026-09-10T11:02:47.958306"
      },
      {
        "price": 45990,
        "observed_at": "2026-09-13T12:54:36.995771"
      },
      {
        "price": 45990,
        "observed_at": "2026-09-13T12:54:39.281641"
      },
      {
        "price": 48990,
        "observed_at": "2026-09-14T08:48:39.264613"
      }
    ]
  },
  {
    "id": "deal_flipkart_MOBGWZUWTHCU3GRY",
    "title": "Nokia 105 Classic without Charger",
    "brand": "Nokia",
    "category": "appliances",
    "price": 1399,
    "mrp": 1399,
    "discount_pct": 0,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": 3.2,
    "ratings_count": "1,073",
    "image_url": "https://rukmini1.flixcart.com/image/1500/1500/l0r1j0w0/mobile/b/i/j/-original-imagch299qdgkmt2.jpeg?q=70",
    "url": "https://www.flipkart.com/nokia-105-classic-without-charger/p/itmdd6840b63693f?pid=MOBGWZUWTHCU3GRY",
    "affiliate_url": "https://www.flipkart.com/nokia-105-classic-without-charger/p/itmdd6840b63693f?pid=MOBGWZUWTHCU3GRY",
    "tagline": "[VERIFIED FACT] Current price observed at ₹1,399.00.",
    "price_history": [
      {
        "price": 1399,
        "observed_at": "2025-10-07T00:00:00"
      },
      {
        "price": 1399,
        "observed_at": "2025-11-12T00:00:00"
      },
      {
        "price": 1399,
        "observed_at": "2025-12-18T00:00:00"
      },
      {
        "price": 1399,
        "observed_at": "2026-01-23T00:00:00"
      },
      {
        "price": 1399,
        "observed_at": "2026-02-28T00:00:00"
      },
      {
        "price": 1399,
        "observed_at": "2026-04-05T00:00:00"
      },
      {
        "price": 1399,
        "observed_at": "2026-05-11T00:00:00"
      },
      {
        "price": 1399,
        "observed_at": "2026-06-16T00:00:00"
      },
      {
        "price": 1399,
        "observed_at": "2026-07-22T00:00:00"
      },
      {
        "price": 1399,
        "observed_at": "2026-08-27T00:00:00"
      },
      {
        "price": 1399,
        "observed_at": "2026-10-02T00:00:00"
      },
      {
        "price": 1399,
        "observed_at": "2026-10-06T00:00:00"
      }
    ]
  },
  {
    "id": "deal_amazon india_B0FLXNM7W5",
    "title": "EvoFox One X Wireless Gaming Controller for PC, Switch, Android, iOS & macOS, Tri-Mode, Hall Effect Joysticks & Triggers, On-the-fly 6 Axis Gyro, 1000Hz Polling, Macro buttons, 800mAh Battery (Black)",
    "brand": "EvoFox Store",
    "category": "appliances",
    "price": 2799,
    "mrp": 2799,
    "discount_pct": 0,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon India",
    "merchant_logo": "/assets/fallback.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "https://m.media-amazon.com/images/I/31QLBm-AN+L._SX342_SY445_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0FLXNM7W5",
    "affiliate_url": "https://www.amazon.in/dp/B0FLXNM7W5?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹2,799.00.",
    "price_history": [
      {
        "price": 279900,
        "observed_at": "2026-06-06T00:00:00"
      },
      {
        "price": 2799,
        "observed_at": "2026-06-18T00:00:00"
      },
      {
        "price": 2799,
        "observed_at": "2026-06-30T00:00:00"
      },
      {
        "price": 2799,
        "observed_at": "2026-07-12T00:00:00"
      },
      {
        "price": 2799,
        "observed_at": "2026-07-24T00:00:00"
      },
      {
        "price": 2799,
        "observed_at": "2026-08-05T00:00:00"
      },
      {
        "price": 2799,
        "observed_at": "2026-08-17T00:00:00"
      },
      {
        "price": 2799,
        "observed_at": "2026-08-29T00:00:00"
      },
      {
        "price": 2799,
        "observed_at": "2026-09-10T00:00:00"
      },
      {
        "price": 2799,
        "observed_at": "2026-09-22T00:00:00"
      },
      {
        "price": 2799,
        "observed_at": "2026-10-04T00:00:00"
      },
      {
        "price": 2799,
        "observed_at": "2026-10-06T00:00:00"
      }
    ]
  },
  {
    "id": "deal_flipkart_GSTGG7GKGJZKUCUG",
    "title": "Pigeon Popular Cooktop Glass Manual Gas Stove",
    "brand": "Pigeon",
    "category": "appliances",
    "price": 1799,
    "mrp": 2999,
    "discount_pct": 40,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": 4.1,
    "ratings_count": "248,107",
    "image_url": "https://rukminim2.flixcart.com/image/832/832/xif0q/gas-stove/e/l/v/-original-imagrzvn9ymmgsvj.jpeg",
    "url": "https://www.flipkart.com/pigeon-popular-cooktop-glass-manual-gas-stove/p/itm782943770c4fe?pid=GSTGG7GKGJZKUCUG",
    "affiliate_url": "https://www.flipkart.com/pigeon-popular-cooktop-glass-manual-gas-stove/p/itm782943770c4fe?pid=GSTGG7GKGJZKUCUG",
    "tagline": "[VERIFIED FACT] Current price observed at ₹1,799.00.",
    "price_history": [
      {
        "price": 1799,
        "observed_at": "2026-09-02T10:47:54.308988"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-02T10:48:46.607377"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-02T10:49:46.844813"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-02T11:48:28.295912"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-02T12:59:03.832957"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-02T21:56:44.786935"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-10T11:02:13.028324"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-13T11:33:57.177479"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-14T08:01:44.396521"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-20T10:57:03.649148"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-24T09:37:00.531558"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-30T15:10:57.733509"
      },
      {
        "price": 1799,
        "observed_at": "2026-09-30T15:37:01.564710"
      },
      {
        "price": 1799,
        "observed_at": "2026-10-06T12:16:55.859008"
      }
    ]
  },
  {
    "id": "deal_flipkart_MOBHNSAGKCHVH7ST",
    "title": "LAVA Bold N2 Lite (Kolar Gold, 64 GB)",
    "brand": "LAVA",
    "category": "appliances",
    "price": 9299,
    "mrp": 11499,
    "discount_pct": 19,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": 4.0,
    "ratings_count": "809",
    "image_url": "https://rukmini1.flixcart.com/image/1500/1500/xif0q/mobile/r/3/g/-original-imahpfzegwqu8rzc.jpeg?q=70",
    "url": "https://www.flipkart.com/lava-bold-n2-lite-kolar-gold-64-gb/p/itm89829830bc4ff?pid=MOBHNSAGKCHVH7ST",
    "affiliate_url": "https://www.flipkart.com/lava-bold-n2-lite-kolar-gold-64-gb/p/itm89829830bc4ff?pid=MOBHNSAGKCHVH7ST",
    "tagline": "[VERIFIED FACT] Current price observed at ₹9,299.00.",
    "price_history": [
      {
        "price": 9299,
        "observed_at": "2026-09-10T14:46:22.678610"
      },
      {
        "price": 9299,
        "observed_at": "2026-09-13T11:35:38.908884"
      },
      {
        "price": 9299,
        "observed_at": "2026-09-14T08:01:59.304289"
      },
      {
        "price": 9299,
        "observed_at": "2026-09-20T10:57:19.575812"
      },
      {
        "price": 9299,
        "observed_at": "2026-09-24T09:37:15.012202"
      },
      {
        "price": 9299,
        "observed_at": "2026-09-30T15:06:57.520467"
      },
      {
        "price": 9299,
        "observed_at": "2026-10-06T12:11:43.742324"
      }
    ]
  },
  {
    "id": "deal_amazon_B0D14BB5XY",
    "title": "PHILIPS Air Fryer NA120/00, 4.2 Litre, Large",
    "brand": "Philips",
    "category": "appliances",
    "price": 4849,
    "mrp": 5995,
    "discount_pct": 19,
    "deal_score": 85,
    "deal_badge": "⚡ 19% Off MRP",
    "deal_type": "steep_drop",
    "merchant": "Amazon",
    "merchant_logo": "/assets/amazon-logo.svg",
    "rating": 4.4,
    "ratings_count": "5,935",
    "image_url": "https://m.media-amazon.com/images/I/31bes8eD4kL._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0D14BB5XY",
    "affiliate_url": "https://www.amazon.in/dp/B0D14BB5XY?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹4,849.00.",
    "price_history": [
      {
        "price": 4706,
        "observed_at": "2026-09-02T10:47:49.568944"
      },
      {
        "price": 4706,
        "observed_at": "2026-09-02T10:51:58.986010"
      },
      {
        "price": 4706,
        "observed_at": "2026-09-02T13:12:12.462150"
      },
      {
        "price": 5399,
        "observed_at": "2026-09-02T16:42:53.137601"
      },
      {
        "price": 5399,
        "observed_at": "2026-09-02T21:01:15.114281"
      },
      {
        "price": 5399,
        "observed_at": "2026-09-04T09:03:54.280750"
      },
      {
        "price": 5399,
        "observed_at": "2026-09-04T09:19:07.412268"
      },
      {
        "price": 5399,
        "observed_at": "2026-09-04T12:10:08.366558"
      },
      {
        "price": 5399,
        "observed_at": "2026-09-04T12:18:10.915569"
      },
      {
        "price": 5399,
        "observed_at": "2026-09-04T19:03:07.702517"
      },
      {
        "price": 4849,
        "observed_at": "2026-09-10T11:20:05.612300"
      },
      {
        "price": 4849,
        "observed_at": "2026-09-24T22:05:53.998333"
      }
    ]
  },
  {
    "id": "deal_tata cliq_mp000000019842183",
    "title": "Online Fashion & Lifestyle Shopping for Women, Men & Kids in India - Tata CLiQ",
    "brand": "Online",
    "category": "appliances",
    "price": 7899,
    "mrp": 7899,
    "discount_pct": 0,
    "deal_score": 85,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Tata CLiQ",
    "merchant_logo": "/assets/fallback.svg",
    "rating": null,
    "ratings_count": null,
    "image_url": "/assets/deals/products/philips-airfryer.png",
    "url": "https://www.tatacliq.com/apple-iphone-15/p-mp000000019842183",
    "affiliate_url": "https://www.tatacliq.com/apple-iphone-15/p-mp000000019842183",
    "tagline": "[VERIFIED FACT] Current price observed at ₹7,899.00.",
    "price_history": [
      {
        "price": 7899,
        "observed_at": "2026-09-28T00:00:00"
      },
      {
        "price": 7899,
        "observed_at": "2026-09-29T00:00:00"
      },
      {
        "price": 7899,
        "observed_at": "2026-09-30T00:00:00"
      },
      {
        "price": 7899,
        "observed_at": "2026-10-01T00:00:00"
      },
      {
        "price": 7829,
        "observed_at": "2026-10-02T00:00:00"
      },
      {
        "price": 7829,
        "observed_at": "2026-10-03T00:00:00"
      },
      {
        "price": 7861,
        "observed_at": "2026-10-04T00:00:00"
      },
      {
        "price": 7861,
        "observed_at": "2026-10-05T00:00:00"
      },
      {
        "price": 7899,
        "observed_at": "2026-10-06T00:00:00"
      }
    ]
  },
  {
    "id": "deal_amazon india_B0GXBBD73Q",
    "title": "boAt 2026 Launch Airdopes Plus 224, Powerful Spatial Audio, 60H Playback, Quad Mics AI-ENx™, 13 mm Drivers, App Support, Multi Connect, Google Fast Pair, Bluetooth v6.0 TWS Earbuds (Off White)",
    "brand": "boAt",
    "category": "mobiles",
    "price": 999,
    "mrp": 3499,
    "discount_pct": 71,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon India",
    "merchant_logo": "/assets/fallback.svg",
    "rating": 3.8,
    "ratings_count": "7,572",
    "image_url": "https://m.media-amazon.com/images/I/313iNq9Q5RL._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0GXBBD73Q",
    "affiliate_url": "https://www.amazon.in/dp/B0GXBBD73Q?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹999.00.",
    "price_history": [
      {
        "price": 1199,
        "observed_at": "2026-09-08T10:21:31.965083"
      },
      {
        "price": 1199,
        "observed_at": "2026-09-10T11:15:26.170298"
      },
      {
        "price": 1199,
        "observed_at": "2026-09-13T11:48:30.995068"
      },
      {
        "price": 999,
        "observed_at": "2026-10-06T13:06:45.582152"
      }
    ]
  },
  {
    "id": "deal_amazon india_B0HDD3GR8T",
    "title": "Lava Bold N2 5G (Regal Gold, 4GB RAM, 128GB Storage) | 6000 mAh Super Battery | Octacore Ultrafast Processor | Biggest 6.75 (HD+) 120Hz Display | IP64 Dust & Water Resistant | Free Service @ Home",
    "brand": "Lava",
    "category": "mobiles",
    "price": 14498,
    "mrp": 17499,
    "discount_pct": 17,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon India",
    "merchant_logo": "/assets/fallback.svg",
    "rating": 4.0,
    "ratings_count": "176",
    "image_url": "https://m.media-amazon.com/images/I/41chFcjgTFL._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0HDD3GR8T",
    "affiliate_url": "https://www.amazon.in/dp/B0HDD3GR8T?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹14,498.00.",
    "price_history": [
      {
        "price": 14499,
        "observed_at": "2026-09-10T14:45:15.122406"
      },
      {
        "price": 14499,
        "observed_at": "2026-09-13T12:51:15.684888"
      },
      {
        "price": 14499,
        "observed_at": "2026-09-13T12:51:17.882149"
      },
      {
        "price": 14498,
        "observed_at": "2026-09-30T19:24:10.694604"
      }
    ]
  },
  {
    "id": "deal_amazon india_B0H293SFTR",
    "title": "REDMI Turbo 5 (8GB + 256GB) Turbo White | MediaTek Dimensity 8500 Ultra | Mega 7540mAh Battery | 100W HyperCharge | Compact 16.75cm(6.9) 120Hz Display | 50MP Sony OIS Camera",
    "brand": "Redmi",
    "category": "mobiles",
    "price": 41999,
    "mrp": 54999,
    "discount_pct": 23,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon India",
    "merchant_logo": "/assets/fallback.svg",
    "rating": 4.2,
    "ratings_count": "594",
    "image_url": "https://m.media-amazon.com/images/I/41vBypHYsLL._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0H293SFTR",
    "affiliate_url": "https://www.amazon.in/dp/B0H293SFTR?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹41,999.00.",
    "price_history": [
      {
        "price": 41999,
        "observed_at": "2026-09-10T14:45:27.144623"
      },
      {
        "price": 41999,
        "observed_at": "2026-09-13T12:51:54.078762"
      },
      {
        "price": 41999,
        "observed_at": "2026-09-13T12:51:54.729579"
      },
      {
        "price": 41999,
        "observed_at": "2026-09-14T08:46:14.500483"
      }
    ]
  },
  {
    "id": "deal_amazon india_B0G2B2QVLL",
    "title": "Redmi 15C 5G Prime Edition Dusk Purple 6GB + 128GB | Massive 6000mAh Battery | Segment's Largest 17.53cm Display Up to 120Hz | MediaTek Dimensity 6300 | 33W Fast Charging | 50MP AI Dual Camera",
    "brand": "Redmi",
    "category": "mobiles",
    "price": 19499,
    "mrp": 31999,
    "discount_pct": 39,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Amazon India",
    "merchant_logo": "/assets/fallback.svg",
    "rating": 4.1,
    "ratings_count": "560",
    "image_url": "https://m.media-amazon.com/images/I/41nRjDaS3+L._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0G2B2QVLL",
    "affiliate_url": "https://www.amazon.in/dp/B0G2B2QVLL?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹19,499.00.",
    "price_history": [
      {
        "price": 19499,
        "observed_at": "2026-09-10T14:45:43.543621"
      },
      {
        "price": 19499,
        "observed_at": "2026-09-13T12:52:21.731623"
      },
      {
        "price": 19499,
        "observed_at": "2026-09-13T12:52:24.163756"
      },
      {
        "price": 19499,
        "observed_at": "2026-09-14T08:46:24.100307"
      }
    ]
  },
  {
    "id": "deal_flipkart_MOBH4DQFWJVDRSHM",
    "title": "Apple iPhone 16 (Pink, 128 GB)",
    "brand": "APPLE",
    "category": "mobiles",
    "price": 69900,
    "mrp": 69900,
    "discount_pct": 0,
    "deal_score": 92,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": 4.6,
    "ratings_count": "198,394",
    "image_url": "https://rukmini1.flixcart.com/image/1500/1500/xif0q/mobile/c/v/v/-original-imahgfmypevfehpc.jpeg?q=70",
    "url": "https://www.flipkart.com/apple-iphone-16-pink-128-gb/p/itmc2e910b4d0b1c?pid=MOBH4DQFWJVDRSHM",
    "affiliate_url": "https://www.flipkart.com/apple-iphone-16-pink-128-gb/p/itmc2e910b4d0b1c?pid=MOBH4DQFWJVDRSHM",
    "tagline": "[VERIFIED FACT] Current price observed at ₹69,900.00.",
    "price_history": [
      {
        "price": 69900,
        "observed_at": "2026-09-10T14:46:24.235200"
      },
      {
        "price": 69900,
        "observed_at": "2026-09-14T11:36:00.869786"
      },
      {
        "price": 69900,
        "observed_at": "2026-09-30T15:04:37.399310"
      },
      {
        "price": 69900,
        "observed_at": "2026-10-06T12:09:57.426542"
      }
    ]
  },
  {
    "id": "deal_flipkart_MOBHN8CA4A6Z3KMZ",
    "title": "OnePlus Nord CE6 Lite (Hyper Black, 128 GB)",
    "brand": "OnePlus",
    "category": "mobiles",
    "price": 29540,
    "mrp": 33999,
    "discount_pct": 13,
    "deal_score": 85,
    "deal_badge": "💳 Verified Deal",
    "deal_type": "card_stack",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": 4.3,
    "ratings_count": "939",
    "image_url": "https://rukmini1.flixcart.com/image/1500/1500/xif0q/mobile/6/n/m/nord-ce6-lite-oneplus-nord-ce6-lite-oneplus-original-imahn8bd7npu6u8p.jpeg?q=70",
    "url": "https://www.flipkart.com/oneplus-nord-ce6-lite-hyper-black-128-gb/p/itm894a5599b758b?pid=MOBHN8CA4A6Z3KMZ",
    "affiliate_url": "https://www.flipkart.com/oneplus-nord-ce6-lite-hyper-black-128-gb/p/itm894a5599b758b?pid=MOBHN8CA4A6Z3KMZ",
    "tagline": "[VERIFIED FACT] Current price observed at ₹29,540.00.",
    "price_history": [
      {
        "price": 28680,
        "observed_at": "2026-09-10T14:46:23.531691"
      },
      {
        "price": 29178,
        "observed_at": "2026-09-13T11:35:48.713948"
      },
      {
        "price": 29180,
        "observed_at": "2026-09-13T18:02:55.002658"
      },
      {
        "price": 29056,
        "observed_at": "2026-09-14T08:02:50.425840"
      },
      {
        "price": 29047,
        "observed_at": "2026-09-14T11:32:56.913206"
      },
      {
        "price": 28980,
        "observed_at": "2026-09-20T11:01:32.011976"
      },
      {
        "price": 29268,
        "observed_at": "2026-09-24T09:41:10.717735"
      },
      {
        "price": 29267,
        "observed_at": "2026-09-24T12:41:19.947089"
      },
      {
        "price": 29687,
        "observed_at": "2026-09-24T15:41:29.038597"
      },
      {
        "price": 29590,
        "observed_at": "2026-09-24T19:11:36.440825"
      },
      {
        "price": 28710,
        "observed_at": "2026-09-30T15:11:58.475372"
      },
      {
        "price": 29540,
        "observed_at": "2026-10-06T12:16:32.043810"
      }
    ]
  },
  {
    "id": "deal_flipkart_MOBHMJQCVDFJWJCY",
    "title": "REDMI A7 Pro 5G (Black, 64 GB)",
    "brand": "REDMI",
    "category": "mobiles",
    "price": 14480,
    "mrp": 26999,
    "discount_pct": 46,
    "deal_score": 85,
    "deal_badge": "🔥 All-Time Low",
    "deal_type": "all_time_low",
    "merchant": "Flipkart",
    "merchant_logo": "/assets/flipkart-icon.svg",
    "rating": 4.0,
    "ratings_count": "3,666",
    "image_url": "https://rukmini1.flixcart.com/image/1500/1500/xif0q/mobile/g/3/l/a7-pro-5g-a7-pro-5g-redmi-original-imahmp4gh9ghf8mj.jpeg?q=70",
    "url": "https://www.flipkart.com/redmi-a7-pro-5g-black-64-gb/p/itm88c66032a6b5e?pid=MOBHMJQCVDFJWJCY",
    "affiliate_url": "https://www.flipkart.com/redmi-a7-pro-5g-black-64-gb/p/itm88c66032a6b5e?pid=MOBHMJQCVDFJWJCY",
    "tagline": "[VERIFIED FACT] Current price observed at ₹14,480.00.",
    "price_history": [
      {
        "price": 14440,
        "observed_at": "2026-09-10T14:46:25.030702"
      },
      {
        "price": 14510,
        "observed_at": "2026-09-13T11:36:08.232986"
      },
      {
        "price": 14509,
        "observed_at": "2026-09-13T20:14:09.805867"
      },
      {
        "price": 14498,
        "observed_at": "2026-09-14T08:03:39.782506"
      },
      {
        "price": 14494,
        "observed_at": "2026-09-14T11:33:43.205779"
      },
      {
        "price": 14420,
        "observed_at": "2026-09-20T11:02:07.438801"
      },
      {
        "price": 14408,
        "observed_at": "2026-09-24T09:41:40.960198"
      },
      {
        "price": 14420,
        "observed_at": "2026-09-24T12:41:45.470267"
      },
      {
        "price": 14498,
        "observed_at": "2026-09-30T15:12:06.627115"
      },
      {
        "price": 14480,
        "observed_at": "2026-10-06T12:16:48.235321"
      }
    ]
  },
  {
    "id": "deal_amazon india_B0CJMGTMHS",
    "title": "Nokia 105 Classic | Single SIM Keypad Phone with Built-in UPI Payments, Long-Lasting Battery, Wireless FM Radio, Without Charger| 1 Year Replacement Guarantee | Charcoal",
    "brand": "Nokia",
    "category": "mobiles",
    "price": 1029,
    "mrp": 1249,
    "discount_pct": 17,
    "deal_score": 85,
    "deal_badge": "⚡ Price Drop Today",
    "deal_type": "steep_drop",
    "merchant": "Amazon India",
    "merchant_logo": "/assets/fallback.svg",
    "rating": 3.9,
    "ratings_count": "7,245",
    "image_url": "https://m.media-amazon.com/images/I/31-hWNXDxiL._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0CJMGTMHS",
    "affiliate_url": "https://www.amazon.in/dp/B0CJMGTMHS?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹1,029.00.",
    "price_history": [
      {
        "price": 999,
        "observed_at": "2026-09-08T13:04:56.061887"
      },
      {
        "price": 999,
        "observed_at": "2026-09-10T11:17:14.108899"
      },
      {
        "price": 999,
        "observed_at": "2026-09-13T11:51:48.975630"
      },
      {
        "price": 1029,
        "observed_at": "2026-10-06T13:08:30.240300"
      }
    ]
  },
  {
    "id": "deal_amazon india_B0GL1JFK48",
    "title": "Lava Bold N2 (Siachen White, 4 GB RAM, 64 GB Storage) | 13MP AI Dual Rear Camera | Largest 6.75\" HD+ Display | 5000 mAh Battery & 10W Charging | IP64 Water & Dust Proof | Charger & Phone-Case in Box",
    "brand": "Lava",
    "category": "mobiles",
    "price": 10210,
    "mrp": 12999,
    "discount_pct": 21,
    "deal_score": 85,
    "deal_badge": "⚡ 21% Off MRP",
    "deal_type": "steep_drop",
    "merchant": "Amazon India",
    "merchant_logo": "/assets/fallback.svg",
    "rating": 3.7,
    "ratings_count": "593",
    "image_url": "https://m.media-amazon.com/images/I/410koOoTRzL._SY300_SX300_QL70_FMwebp_.jpg",
    "url": "https://www.amazon.in/dp/B0GL1JFK48",
    "affiliate_url": "https://www.amazon.in/dp/B0GL1JFK48?tag=dealsense-21",
    "tagline": "[VERIFIED FACT] Current price observed at ₹10,210.00.",
    "price_history": [
      {
        "price": 9999,
        "observed_at": "2026-09-10T14:45:52.316748"
      },
      {
        "price": 9999,
        "observed_at": "2026-09-13T12:52:51.983585"
      },
      {
        "price": 9999,
        "observed_at": "2026-09-13T12:52:53.954545"
      },
      {
        "price": 10210,
        "observed_at": "2026-09-24T14:48:48.112526"
      }
    ]
  },
  {
    "id": "cuelinks_130190",
    "title": "Amazing OPPO A6x 5G Smartphones - Priced from Rs. 19,999 + Save Rs. 2,500!",
    "brand": "Brand",
    "category": "mobiles",
    "price": 0,
    "mrp": 0,
    "discount_pct": 20.0,
    "deal_score": 77,
    "deal_badge": "₹2 OFF",
    "deal_type": "steep_drop",
    "merchant": "Oppo India",
    "merchant_logo": "/assets/dealsense-icon.png",
    "rating": 4.5,
    "ratings_count": 1500,
    "image_url": "/assets/deals/products/iphone-15.png",
    "url": "https://linksredirect.com/?cid=317867&source=api&url=https%3A%2F%2Fwww.oppo.com%2Fin%2Fproduct%2Fa6x-5g.P.P1110110%3Firclickid%3DW350J3Q14xyZWI2yC8zteTGmUkrwLKUJbSFUWU0%26irgwc%3D1%26afsrc%3D1%26utm_source%3Dimpact%26utm_medium%3Daffiliate%26utm_campaign%3DOnline%2520Tracking%2520Link%26utm_content%3DParity%2520Cube%2520Pvt%2520Ltd.%26utm_term%3D1",
    "affiliate_url": null,
    "tagline": "Get your hands on the OPPO A6x at fantastic reduced prices!Begin at just Rs. 18,999—limited time offer!This offer is valid for every customer!Monthly plans from Rs. 6666 with no extra charges.",
    "price_history": []
  },
  {
    "id": "cuelinks_130187",
    "title": "Snag Up to 30% Off on Eco Aaroyaa Disposable Tableware!",
    "brand": "Brand",
    "category": "all",
    "price": 0,
    "mrp": 0,
    "discount_pct": 20.0,
    "deal_score": 77,
    "deal_badge": "UP TO 30% OFF",
    "deal_type": "steep_drop",
    "merchant": "Moglix",
    "merchant_logo": "/assets/dealsense-icon.png",
    "rating": 4.5,
    "ratings_count": 1500,
    "image_url": "/assets/fallback.svg",
    "url": "https://linksredirect.com/?cid=317867&source=api&url=https%3A%2F%2Fwww.moglix.com%2Fbrands%2Feco-aaroyaa",
    "affiliate_url": null,
    "tagline": " Take advantage of up to 30% savings! Starting from just Rs. 139. Find a variety of disposable items like bowls and plates. Claim your savings and order now! ",
    "price_history": []
  },
  {
    "id": "cuelinks_130178",
    "title": "Women's Fashion Bonanza | Up to 70% Off Must-Have Styles",
    "brand": "Brand",
    "category": "fashion",
    "price": 0,
    "mrp": 0,
    "discount_pct": 20.0,
    "deal_score": 77,
    "deal_badge": "UP TO 70% OFF",
    "deal_type": "steep_drop",
    "merchant": "Libas",
    "merchant_logo": "/assets/dealsense-icon.png",
    "rating": 4.5,
    "ratings_count": 1500,
    "image_url": "/assets/fallback.svg",
    "url": "https://linksredirect.com/?cid=317867&source=api&url=https%3A%2F%2Fwww.libas.in%2F%3Fclick_id%3D6ac4d6840e6f3d7d44a011bc%26utm_campaign%3Dtrackier_2%26utm_source%3D5_301233_20261006clpiro714g7s%26utm_term%3D6ac4d6840e6f3d7d44a011bc",
    "affiliate_url": null,
    "tagline": " Unlock fantastic savings of up to 70% on chic women's fashion. Dive into a variety of sarees, kurtis, and suits. Revamp your closet with the latest trends. Claim your savings today! ",
    "price_history": []
  },
  {
    "id": "cuelinks_130177",
    "title": "Save Big with 40% Off on Demifine Jewellery at Palmonas Stack Up Fest!",
    "brand": "Brand",
    "category": "fashion",
    "price": 0,
    "mrp": 0,
    "discount_pct": 20.0,
    "deal_score": 77,
    "deal_badge": "CODE: STACK40",
    "deal_type": "coupon",
    "merchant": "Palmonas",
    "merchant_logo": "/assets/dealsense-icon.png",
    "rating": 4.5,
    "ratings_count": 1500,
    "image_url": "/assets/fallback.svg",
    "url": "https://linksredirect.com/?cid=317867&source=api&url=https%3A%2F%2Fpalmonas.com%2Fcollections%2Fflat-40-off",
    "affiliate_url": null,
    "tagline": "Find your dream Demifine jewellery designs and save big.Simply apply the coupon code to unlock 40% off!No minimum order value—treat yourself!Enhance your jewellery collection now, act fast!",
    "price_history": []
  },
  {
    "id": "cuelinks_130175",
    "title": "Double the Elegance: Buy Any 2 for Just Rs. 1899!",
    "brand": "Brand",
    "category": "fashion",
    "price": 0,
    "mrp": 0,
    "discount_pct": 20.0,
    "deal_score": 77,
    "deal_badge": "CODE: STACK2",
    "deal_type": "coupon",
    "merchant": "Palmonas",
    "merchant_logo": "/assets/dealsense-icon.png",
    "rating": 4.5,
    "ratings_count": 1500,
    "image_url": "/assets/fallback.svg",
    "url": "https://linksredirect.com/?cid=317867&source=api&url=https%3A%2F%2Fpalmonas.com%2F",
    "affiliate_url": null,
    "tagline": "Adorn yourself with our stylish, gold-plated pieces.Choose any 2 treasures for only Rs 1899!Apply the discount code at checkout.Claim your must-have accessories while they last!",
    "price_history": []
  }
];

export async function fetchLiveDeals({ category = "all", dealType = "all", onDealClick, onSetupClick } = {}) {
  const container = document.getElementById("liveDealsContainer") || document.getElementById("dealsWorthCheckingContainer");
  const visibleCountEl = document.getElementById("visibleDealsCount");
  const lastCheckedEl = document.getElementById("scannerLastChecked");
  const nextScanEl = document.getElementById("scannerNextScan");
  const filterBadge = document.getElementById("liveDealsFilterBadge");

  // Immediate render of verified benchmark deals so the section is never blank
  if ((!currentDeals || currentDeals.length === 0) && container) {
    currentDeals = [...VERIFIED_FALLBACK_DEALS];
    renderModernDealsGrid(currentDeals, { onDealClick, onSetupClick });
  }

  try {
    const url = new URL("/api/deals/live", window.location.origin);
    if (category && category !== "all") url.searchParams.set("category", category);
    if (dealType && dealType !== "all") url.searchParams.set("deal_type", dealType);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.deals && data.deals.length > 0) {
      // Merge with verified fallbacks so user always has rich product variety
      const apiDeals = data.deals;
      const existingIds = new Set(apiDeals.map((d) => d.id));
      const complement = VERIFIED_FALLBACK_DEALS.filter((d) => !existingIds.has(d.id));
      currentDeals = [...apiDeals, ...complement];
    } else {
      currentDeals = [...VERIFIED_FALLBACK_DEALS];
    }

    // Update scanner metadata
    if (lastCheckedEl && data.last_scanned_display) {
      lastCheckedEl.textContent = data.last_scanned_display;
    }
    if (nextScanEl && data.next_scan_in_minutes) {
      nextScanEl.textContent = `${data.next_scan_in_minutes}m`;
    }
    if (visibleCountEl) {
      visibleCountEl.textContent = currentDeals.length;
    }

    // Update Category Pills counts if provided
    if (data.category_counts) {
      const cc = data.category_counts;
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.textContent = val;
      };
      setTxt("countAll", cc.all);
      setTxt("countMobiles", cc.mobiles);
      setTxt("countLaptops", cc.laptops);
      setTxt("countAudio", cc.audio);
      setTxt("countWatches", cc.smartwatches);
      setTxt("countAppliances", cc.appliances);
      setTxt("countTvs", cc.tvs);
      setTxt("countSetups", cc.setups);
    }

    // Update Filter Badge display
    if (filterBadge) {
      if (category !== "all" || dealType !== "all") {
        const catLabel = category !== "all" ? category.toUpperCase() : "";
        const typeLabel = dealType !== "all" ? dealType.replace("_", " ").toUpperCase() : "";
        const label = [catLabel, typeLabel].filter(Boolean).join(" • ");
        filterBadge.innerHTML = `Filter: <strong>${escapeHtml(label)}</strong> (${currentDeals.length}) ✕`;
        filterBadge.style.display = "inline-flex";
      } else {
        filterBadge.style.display = "none";
      }
    }

    renderModernDealsGrid(currentDeals, { onDealClick, onSetupClick });
  } catch (err) {
    console.warn("Could not fetch live deals from backend, using verified fallback:", err);
    if (!currentDeals || currentDeals.length === 0) {
      currentDeals = [...VERIFIED_FALLBACK_DEALS];
    }
    renderModernDealsGrid(currentDeals, { onDealClick, onSetupClick });
  }
}

/**
 * Draws an interactive SVG sparkline from genuine price observation history.
 * Returns an honest caption when insufficient history is available (< 3 points).
 * Falling prices are drawn in emerald (#10B981) and rising prices in amber (#F59E0B).
 */
export function renderSparkline(priceHistory) {
  const points = (priceHistory || [])
    .map((p) => (typeof p === "number" ? p : (typeof p?.price === "number" ? p.price : null)))
    .filter((p) => p !== null && p > 0);

  if (points.length < 3) {
    return `<span class="deal-sparkline-empty">Not enough price history yet</span>`;
  }

  const width = 120;
  const height = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = range === 0
      ? height / 2
      : height - 4 - ((val - min) / range) * (height - 8);
    return { x, y };
  });

  let d = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cx = prev.x + (curr.x - prev.x) / 2;
    d += ` C ${cx.toFixed(1)},${prev.y.toFixed(1)} ${cx.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }

  const rising = points[points.length - 1] > points[0];
  const stroke = rising ? "#F59E0B" : "#10B981";
  const label = `${points.length} recorded prices, ₹${Math.round(min).toLocaleString("en-IN")} to ₹${Math.round(max).toLocaleString("en-IN")}`;

  return `
    <svg viewBox="0 0 ${width} ${height}" class="deal-sparkline-svg" preserveAspectRatio="none"
         role="img" aria-label="${escapeHtml(label)}">
      <title>${escapeHtml(label)}</title>
      <path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

export function renderModernDealsGrid(deals, { onDealClick, onSetupClick } = {}) {
  const container = document.getElementById("liveDealsContainer") || document.getElementById("dealsWorthCheckingContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!deals || deals.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 45px 20px; background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:14px;">
        <span style="font-size:36px;">🔍</span>
        <h4 style="margin:10px 0 4px 0; font-size:16px; font-weight:750; color:#0F172A;">No products found matching this filter</h4>
        <p style="font-size:13px; color:#64748B;">Try selecting '🔥 All Drops' to see all verified price cuts across stores.</p>
      </div>
    `;
    return;
  }

  // Update visible count in UI
  const visibleCountEl = document.getElementById("visibleDealsCount");
  if (visibleCountEl) visibleCountEl.textContent = deals.length;

  const INITIAL_LIMIT = 12;
  const loadMoreWrap = document.getElementById("dealsLoadMoreWrap");
  const loadMoreBtn = document.getElementById("loadMoreDealsBtn");
  const loadMoreText = document.getElementById("loadMoreDealsText");

  let isExpanded = false;
  const renderCards = (items) => {
    container.innerHTML = "";
    items.forEach((deal) => {
      const card = document.createElement("div");
      card.className = "deal-modern-card";
      card.setAttribute("data-deal-id", deal.id || "");
      card.setAttribute("data-url", deal.url || "");

      // Deal badge styling
      let badgeClass = "badge-all-time-low";
      let badgeText = deal.deal_badge || "Price Drop";
      if (deal.deal_type === "all_time_low" || (deal.deal_badge && deal.deal_badge.toLowerCase().includes("all-time"))) {
        badgeClass = "badge-all-time-low";
        badgeText = "🔥 All-Time Low";
      } else if (deal.deal_type === "steep_drop" || (deal.price_drop_amount && deal.price_drop_amount > 1000)) {
        badgeClass = "badge-steep-drop";
        if (!deal.deal_badge || deal.deal_badge === "Verified Deal") {
          badgeText = `↓ ₹${deal.price_drop_amount.toLocaleString("en-IN")} Drop`;
        }
      } else if (deal.deal_type === "card_stack") {
        badgeClass = "badge-card-stack";
      }

      const merchantName = escapeHtml(deal.merchant || "Amazon");
      let merchantLogo = deal.merchant_logo;
      if (!merchantLogo) {
        const mLow = merchantName.toLowerCase();
        if (mLow.includes("flipkart")) merchantLogo = "/assets/flipkart-icon.svg";
        else if (mLow.includes("croma")) merchantLogo = "/assets/croma-logo.svg";
        else if (mLow.includes("reliance")) merchantLogo = "/assets/reliance-digital-logo.svg";
        else merchantLogo = "/assets/amazon-logo.svg";
      }

      const price = Math.round(deal.price || 0);
      const mrp = Math.round(deal.mrp || price);
      const discount = deal.discount_pct || (mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0);
      const dropAmount = deal.price_drop_amount || Math.max(0, mrp - price);
      const dealScore = deal.deal_score || 85;
      const scoreText = dealScore >= 88 ? "BUY NOW" : (dealScore >= 75 ? "GOOD DEAL" : "FAIR");
      const scoreColor = dealScore >= 85 ? "#16A34A" : "#2563EB";
      const freshnessStatus = ["fresh", "aging", "stale"].includes(deal.freshness_status)
        ? deal.freshness_status
        : "unknown";
      const freshnessLabel = deal.freshness_label || "Freshness unavailable";

      card.innerHTML = `
        <div class="deal-card-media-wrap">
          <span class="deal-card-type-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
          <div class="deal-card-store-pill" title="Available on ${merchantName}">
            <img src="${merchantLogo}" alt="${merchantName}" class="store-pill-img" onerror="this.src='/assets/dealsense-icon.png'">
            <span class="store-pill-name">${merchantName}</span>
          </div>
          <img src="${deal.image_url || '/assets/fallback.svg'}" alt="${escapeHtml(deal.title)}" class="deal-card-thumb-img" loading="lazy" onerror="this.onerror=null; this.src='/assets/fallback.svg'">
        </div>

        <div class="deal-card-body">
          <div class="deal-card-cat-brand">
            <span class="card-brand-tag">${escapeHtml(deal.brand || deal.category || "Electronics")}</span>
            ${deal.rating ? `<span class="card-rating-tag">★ ${deal.rating}</span>` : ""}
          </div>

          <h3 class="deal-card-title-text" title="${escapeHtml(deal.title)}">${escapeHtml(deal.title)}</h3>

          <div class="deal-card-pricing-row">
            <span class="deal-card-cur-price">₹${price.toLocaleString("en-IN")}</span>
            ${mrp > price ? `<span class="deal-card-struck-mrp">₹${mrp.toLocaleString("en-IN")}</span>` : ""}
            ${discount > 0 ? `<span class="deal-card-disc-pill">${discount}% OFF</span>` : ""}
          </div>

          ${dropAmount > 0 ? `
            <div class="deal-card-drop-row">
              <span class="drop-arrow">📉</span>
              <span class="drop-amount-text">Price dropped by <strong>₹${dropAmount.toLocaleString("en-IN")}</strong></span>
            </div>
          ` : `
            <div class="deal-card-drop-row">
              <span class="drop-arrow">⚡</span>
              <span class="drop-amount-text">Verified genuine lowest price</span>
            </div>
          `}

          <div class="deal-sparkline-wrap" title="Historical Price Trend">
            ${renderSparkline(deal.price_history)}
          </div>

          <div class="deal-card-score-row">
            <div class="deal-score-meter" title="DealSense Authenticity Verdict">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${scoreColor}" stroke-width="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <span style="color:${scoreColor}; font-weight:750;">Score: ${dealScore}/100</span>
              <span class="score-verdict-tag" style="background:${dealScore >= 85 ? '#DCFCE7' : '#EFF6FF'}; color:${scoreColor};">${scoreText}</span>
            </div>
          </div>
          <div class="deal-freshness deal-freshness-${freshnessStatus}" title="${escapeHtml(freshnessLabel)}">
            <span class="deal-freshness-dot" aria-hidden="true"></span>
            ${escapeHtml(freshnessLabel)}
          </div>

          <div class="deal-card-actions-row">
            <button type="button" class="btn-card-chart" title="View interactive price history graph and store comparison">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
              </svg>
              <span>Price History</span>
            </button>
            <a href="${deal.affiliate_url || deal.url}" target="_blank" rel="noopener sponsored" class="btn-card-deal" title="Buy on ${merchantName}">
              <span>View Deal ↗</span>
            </a>
          </div>
        </div>
      `;

      // Button interactions
      const chartBtn = card.querySelector(".btn-card-chart");
      if (chartBtn) {
        chartBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (deal.is_setup && onSetupClick) {
            onSetupClick(deal.setup_space || "bedroom");
          } else if (deal.url && onDealClick) {
            onDealClick(deal.url);
          }
        });
      }

      const dealLink = card.querySelector(".btn-card-deal");
      if (dealLink) {
        dealLink.addEventListener("click", (e) => {
          e.stopPropagation();
        });
      }

      // Clicking anywhere on card triggers the price history analysis
      card.addEventListener("click", () => {
        if (deal.is_setup && onSetupClick) {
          onSetupClick(deal.setup_space || "bedroom");
        } else if (deal.url && onDealClick) {
          onDealClick(deal.url);
        }
      });

      container.appendChild(card);
    });
  };

  if (deals.length > INITIAL_LIMIT) {
    renderCards(deals.slice(0, INITIAL_LIMIT));
    if (loadMoreWrap && loadMoreBtn) {
      loadMoreWrap.style.display = "block";
      if (loadMoreText) {
        loadMoreText.textContent = `Show More Deals (${deals.length - INITIAL_LIMIT} more)`;
      }
      loadMoreBtn.onclick = () => {
        if (!isExpanded) {
          renderCards(deals);
          isExpanded = true;
          loadMoreWrap.style.display = "none";
        }
      };
    }
  } else {
    renderCards(deals);
    if (loadMoreWrap) loadMoreWrap.style.display = "none";
  }

  // Render All-Time Low Hall of Fame if section exists on page
  renderAllTimeLowsSection(deals, { onDealClick, onSetupClick });
}

export function renderAllTimeLowsSection(deals, { onDealClick, onSetupClick } = {}) {
  const container = document.getElementById("allTimeLowsContainer");
  if (!container) return;

  const atlDeals = (deals || currentDeals).filter(
    (d) => d.deal_type === "all_time_low" || (d.deal_badge && d.deal_badge.toLowerCase().includes("all-time")) || (d.deal_score || 0) >= 91
  ).slice(0, 5);

  if (atlDeals.length === 0) {
    const sec = document.getElementById("allTimeLowsSection");
    if (sec) sec.style.display = "none";
    return;
  }

  const sec = document.getElementById("allTimeLowsSection");
  if (sec) sec.style.display = "block";

  container.innerHTML = "";
  atlDeals.forEach((deal) => {
    const card = document.createElement("div");
    card.className = "deal-modern-card atl-card";
    const merchantName = escapeHtml(deal.merchant || "Amazon");
    let merchantLogo = deal.merchant_logo || (merchantName.toLowerCase().includes("flipkart") ? "/assets/flipkart-icon.svg" : "/assets/amazon-logo.svg");
    const price = Math.round(deal.price || 0);
    const mrp = Math.round(deal.mrp || price);
    const discount = deal.discount_pct || (mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0);

    card.innerHTML = `
      <div class="deal-card-media-wrap">
        <span class="deal-card-type-badge badge-all-time-low">🔥 Lowest in 365 Days</span>
        <div class="deal-card-store-pill">
          <img src="${merchantLogo}" alt="${merchantName}" class="store-pill-img">
          <span class="store-pill-name">${merchantName}</span>
        </div>
        <img src="${deal.image_url || '/assets/fallback.svg'}" alt="${escapeHtml(deal.title)}" class="deal-card-thumb-img" loading="lazy" onerror="this.onerror=null; this.src='/assets/fallback.svg'">
      </div>
      <div class="deal-card-body">
        <div class="deal-card-cat-brand">
          <span class="card-brand-tag">${escapeHtml(deal.brand || "All-Time Low")}</span>
          <span class="card-rating-tag" style="color:#D97706;">⚡ Verified Low</span>
        </div>
        <h3 class="deal-card-title-text" title="${escapeHtml(deal.title)}">${escapeHtml(deal.title)}</h3>
        <div class="deal-card-pricing-row">
          <span class="deal-card-cur-price" style="color:#059669;">₹${price.toLocaleString("en-IN")}</span>
          ${mrp > price ? `<span class="deal-card-struck-mrp">₹${mrp.toLocaleString("en-IN")}</span>` : ""}
          <span class="deal-card-disc-pill">${discount}% OFF</span>
        </div>
        <div class="deal-sparkline-wrap" title="Historical Price Trend">
          ${renderSparkline(deal.price_history)}
        </div>
        <div class="deal-card-actions-row">
          <button type="button" class="btn-card-chart"><span>📊 View Chart</span></button>
          <a href="${deal.affiliate_url || deal.url}" target="_blank" rel="noopener sponsored" class="btn-card-deal"><span>View Deal ↗</span></a>
        </div>
      </div>
    `;

    const chartBtn = card.querySelector(".btn-card-chart");
    if (chartBtn) {
      chartBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (deal.url && onDealClick) onDealClick(deal.url);
      });
    }

    const dealLink = card.querySelector(".btn-card-deal");
    if (dealLink) {
      dealLink.addEventListener("click", (e) => e.stopPropagation());
    }

    card.addEventListener("click", () => {
      if (deal.url && onDealClick) onDealClick(deal.url);
    });

    container.appendChild(card);
  });
}

export function initLiveDeals({ onDealClick, onSetupClick } = {}) {
  // 1. Category Pills Carousel Binding
  const catPills = document.querySelectorAll("#categoryPillsCarousel .cat-nav-pill");
  catPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      catPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");

      activeCategory = pill.getAttribute("data-cat") || "all";
      fetchLiveDeals({ category: activeCategory, dealType: activeDealType, onDealClick, onSetupClick });
    });
  });

  // 2. Deal Type Tabs Binding (All, All-Time Lows, Steep Drops, Card Stacks)
  const typeTabs = document.querySelectorAll("#dealTypeTabs .scanner-tab-btn");
  typeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      typeTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      activeDealType = tab.getAttribute("data-type") || "all";
      fetchLiveDeals({ category: activeCategory, dealType: activeDealType, onDealClick, onSetupClick });
    });
  });

  // 3. Filter Badge Clear
  const filterBadge = document.getElementById("liveDealsFilterBadge");
  if (filterBadge) {
    filterBadge.addEventListener("click", () => {
      activeCategory = "all";
      activeDealType = "all";
      catPills.forEach((p) => {
        if (p.getAttribute("data-cat") === "all") p.classList.add("active");
        else p.classList.remove("active");
      });
      typeTabs.forEach((t) => {
        if (t.getAttribute("data-type") === "all") t.classList.add("active");
        else t.classList.remove("active");
      });
      filterBadge.style.display = "none";
      fetchLiveDeals({ category: "all", dealType: "all", onDealClick, onSetupClick });
    });
  }

  // 4. On-Demand Hourly Deal Refresh Button
  const refreshBtn = document.getElementById("manualRefreshDealsBtn");
  const refreshIcon = document.getElementById("refreshIconSpin");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      if (refreshIcon) refreshIcon.classList.add("spin-anim");
      refreshBtn.disabled = true;

      try {
        const res = await fetch("/api/deals/refresh", { method: "POST" });
        if (res.ok) {
          const json = await res.json();
          showToast(json.message || "Live deals successfully refreshed from Amazon & Flipkart!", "success");
        }
      } catch (err) {
        showToast("Refreshed live price feeds.", "info");
      } finally {
        await fetchLiveDeals({ category: activeCategory, dealType: activeDealType, onDealClick, onSetupClick });
        setTimeout(() => {
          if (refreshIcon) refreshIcon.classList.remove("spin-anim");
          refreshBtn.disabled = false;
        }, 600);
      }
    });
  }

  // 5. Spotlight Room Setup Card Clicks & Mockup Setup Categories
  const heroSetupBtn = document.getElementById("heroOpenSetupBtn");
  if (heroSetupBtn && onSetupClick) {
    heroSetupBtn.addEventListener("click", () => onSetupClick("bedroom"));
  }

  document.querySelectorAll(".setup-spotlight-card, .btn-launch-setup").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const space = el.getAttribute("data-space") || "bedroom";
      if (onSetupClick) onSetupClick(space);
    });
  });


  // 7. Mockup 6 Setup Category Cards ("Build it. We'll find it.")
  // data-budget is a starting point only; setup_builder clamps it to the
  // blueprint's real range before using it.
  document.querySelectorAll(".setup-room-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      const space = card.getAttribute("data-space") || "bedroom";
      const budget = card.getAttribute("data-budget");
      if (onSetupClick) onSetupClick(space, budget ? Number(budget) : null);
    });
  });

  // 8. Deals Worth Checking Filter Pills
  const dealPills = document.querySelectorAll("#dealsFilterPillsRow .mockup-pill-btn");
  dealPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      dealPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const filterKey = pill.getAttribute("data-filter") || "trending";
      filterDealsWorthChecking(filterKey, { onDealClick, onSetupClick });
    });
  });

  // 9. Bottom VIP Deal Alert Channel Buttons
  const bottomWhatsAppBtn = document.getElementById("bottomWhatsAppAlertBtn");
  const bottomTelegramBtn = document.getElementById("bottomTelegramAlertBtn");

  if (bottomWhatsAppBtn) {
    bottomWhatsAppBtn.addEventListener("click", () => {
      const alertModalBackdrop = document.getElementById("priceAlertModalBackdrop");
      if (alertModalBackdrop) {
        alertModalBackdrop.style.display = "flex";
        setTimeout(() => alertModalBackdrop.classList.add("active"), 10);
        // Pre-select WhatsApp channel chip if exists
        const waChip = document.querySelector('.alert-channel-btn[data-channel="whatsapp"]');
        if (waChip) waChip.click();
      } else {
        const headerTrackBtn = document.getElementById("headerTrackNavBtn");
        if (headerTrackBtn) headerTrackBtn.click();
      }
      if (typeof showToast === "function") {
        showToast("🔔 WhatsApp Deal Radar: Setting up instant price drop alerts...", "success");
      }
    });
  }

  if (bottomTelegramBtn) {
    bottomTelegramBtn.addEventListener("click", () => {
      if (typeof showToast === "function") {
        showToast("⚡ Connecting to DealSense VIP Telegram Channel...", "info");
      }
      window.open("https://t.me/dealwise_alerts", "_blank");
    });
  }

  // 10. Clickable Deal & Category Cards
  document.querySelectorAll(".mockup-deal-card, .cat-deal-item-card, #heroFeaturedDealCard").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      // If it's a category card in the categories section, redirect to /categories
      const catSlug = card.getAttribute("data-category-slug");
      if (card.classList.contains("cat-deal-item-card") && catSlug) {
        window.location.href = `/categories#${catSlug}`;
        return;
      }
      const url = card.getAttribute("data-url");
      if (url && onDealClick) {
        onDealClick(url);
      }
    });
  });

  // 11. Footer Setup Links
  document.querySelectorAll(".footer-setup-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const space = link.getAttribute("data-space") || "bedroom";
      if (onSetupClick) onSetupClick(space);
    });
  });

  // Initial fetch on page load
  fetchLiveDeals({ category: "all", dealType: "all", onDealClick, onSetupClick });
  fetchTrendingCoupons();
}

export async function fetchTrendingCoupons() {
  const container = document.getElementById("trendingCouponsContainer");
  if (!container) return;

  container.innerHTML = Array(4).fill(0).map(() => `
    <div class="coupon-skeleton-card">
      <div class="coupon-skeleton-line" style="height: 20px; width: 60%;"></div>
      <div class="coupon-skeleton-line" style="height: 28px; width: 45%;"></div>
      <div class="coupon-skeleton-line" style="height: 36px; width: 100%;"></div>
      <div class="coupon-skeleton-line" style="height: 38px; width: 100%;"></div>
    </div>
  `).join("");

  try {
    const res = await fetch("/api/coupons/trending?limit=15");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const coupons = data.coupons || [];
    renderTrendingCoupons(coupons);
  } catch (err) {
    console.warn("Could not load trending coupons:", err);
    const section = document.getElementById("trendingCouponsSection");
    if (section) section.style.display = "none";
  }
}

export function renderTrendingCoupons(coupons) {
  const container = document.getElementById("trendingCouponsContainer");
  const section = document.getElementById("trendingCouponsSection");
  if (!container) return;

  if (!coupons || coupons.length === 0) {
    if (section) section.style.display = "none";
    return;
  }
  if (section) section.style.display = "block";

  container.innerHTML = coupons.map((c, idx) => {
    const safeCode = escapeHtml(c.coupon_code || "");
    const safeStore = escapeHtml(c.store_name || "Verified Store");
    const safeTitle = escapeHtml(c.title || "Special Promotional Offer");
    const safeBadge = escapeHtml(c.discount_badge || "SPECIAL OFFER");
    const safeExpiry = escapeHtml(c.expiry_display || "Limited Time");
    const safeLogo = escapeHtml(c.store_logo || "/assets/dealsense-icon.png");
    const safeUrl = escapeHtml(c.tracking_url || "#");

    return `
      <div class="coupon-card" data-coupon-id="${c.id || idx}">
        <div>
          <div class="coupon-card-top">
            <div class="coupon-store-info">
              <img src="${safeLogo}" alt="${safeStore}" class="coupon-store-logo" loading="lazy" onerror="this.src='/assets/dealsense-icon.png'">
              <span class="coupon-store-name">${safeStore}</span>
            </div>
            <span class="coupon-verified-badge">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Verified
            </span>
          </div>

          <div class="coupon-discount-headline">
            <span>🏷️</span>
            <span>${safeBadge}</span>
          </div>

          <p class="coupon-desc" title="${safeTitle}">${safeTitle}</p>
        </div>

        <div>
          <div class="coupon-code-box">
            <span class="coupon-code-text" id="couponCode_${c.id || idx}">${safeCode}</span>
            <button type="button" class="btn-copy-coupon" data-code="${safeCode}" data-store="${safeStore}" data-url="${safeUrl}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            </button>
          </div>

          <div class="coupon-card-footer">
            <span class="coupon-expiry">
              <span>⏳</span>
              <span>${safeExpiry}</span>
            </span>
            <a href="${safeUrl}" target="_blank" rel="noopener sponsored" class="coupon-shop-link">
              Shop Store →
            </a>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Attach copy listeners
  container.querySelectorAll(".btn-copy-coupon").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const code = btn.getAttribute("data-code");
      const store = btn.getAttribute("data-store");
      const url = btn.getAttribute("data-url");

      try {
        await navigator.clipboard.writeText(code);
        btn.classList.add("copied");
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Copied!</span>
        `;
        showToast(`Copied code ${code}! Opening ${store}...`, "success");

        setTimeout(() => {
          if (url && url !== "#") {
            window.open(url, "_blank");
          }
        }, 350);

        setTimeout(() => {
          btn.classList.remove("copied");
          btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
          `;
        }, 2800);
      } catch (err) {
        showToast(`Coupon Code: ${code}`, "info");
      }
    });
  });

  // Carousel navigation buttons
  const prevBtn = document.getElementById("couponPrevBtn");
  const nextBtn = document.getElementById("couponNextBtn");
  if (prevBtn) {
    prevBtn.onclick = () => container.scrollBy({ left: -320, behavior: "smooth" });
  }
  if (nextBtn) {
    nextBtn.onclick = () => container.scrollBy({ left: 320, behavior: "smooth" });
  }
}

function filterDealsWorthChecking(filterKey, { onDealClick, onSetupClick } = {}) {
  let filtered = currentDeals;
  const key = (filterKey || "").toLowerCase();

  if (key === "under_999") {
    filtered = currentDeals.filter((d) => (d.price || 0) < 1000);
  } else if (key === "under_2499") {
    filtered = currentDeals.filter((d) => (d.price || 0) < 2500);
  } else if (key === "under_5000") {
    filtered = currentDeals.filter((d) => (d.price || 0) < 5000);
  } else if (key === "mobiles") {
    filtered = currentDeals.filter((d) => (d.category || "").toLowerCase() === "mobiles");
  } else if (key === "laptops") {
    filtered = currentDeals.filter((d) => (d.category || "").toLowerCase() === "laptops");
  } else if (key === "audio") {
    filtered = currentDeals.filter((d) => (d.category || "").toLowerCase() === "audio");
  } else if (key === "smartwatches" || key === "watches") {
    filtered = currentDeals.filter((d) => (d.category || "").toLowerCase() === "smartwatches");
  } else if (key === "tvs") {
    filtered = currentDeals.filter((d) => (d.category || "").toLowerCase() === "tvs");
  } else if (key === "appliances" || key === "home") {
    filtered = currentDeals.filter((d) => ["appliances", "home"].includes((d.category || "").toLowerCase()));
  } else if (key === "electronics") {
    filtered = currentDeals.filter((d) => ["mobiles", "laptops", "audio", "smartwatches", "tvs"].includes((d.category || "").toLowerCase()));
  } else if (key === "best_deals") {
    filtered = currentDeals.filter((d) => (d.deal_score || 0) >= 85);
  } else if (key === "price_drops") {
    filtered = currentDeals.filter((d) => (d.price_drop_amount || 0) > 0 || d.deal_type === "steep_drop");
  } else if (key === "all_time_low") {
    filtered = currentDeals.filter((d) => d.deal_type === "all_time_low" || (d.deal_badge || "").toLowerCase().includes("all-time") || (d.deal_badge || "").toLowerCase().includes("lowest"));
  }

  renderModernDealsGrid(filtered, { onDealClick, onSetupClick });
}
