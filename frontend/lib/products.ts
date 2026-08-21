export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
}

export const products: Product[] = [
  { id: "quai-hoodie", name: "Quai Network Hoodie", description: "Heavyweight fleece hoodie with embroidered Quai logo.", price: 3, image: "/products/hoodie.jpg" },
  { id: "quai-cap", name: "Quai Logo Cap", description: "Adjustable cap with embroidered front patch.", price: 2, image: "/products/cap.jpg" },
  { id: "hardware-wallet", name: "SecureKey Hardware Wallet", description: "Open-source hardware wallet with USB-C.", price: 3, image: "/products/wallet.jpg" },
  { id: "t-shirt", name: "Developer T-Shirt", description: "Soft cotton tee, unisex fit. QUAI is money.", price: 2, image: "/products/tshirt.jpg" },
  { id: "sticker-pack", name: "Sticker Pack (10)", description: "Ten vinyl stickers for your laptop, water bottle, wherever.", price: 1, image: "/products/stickers.jpg" },
  { id: "coffee-mug", name: "Ceramic Coffee Mug", description: "12oz ceramic mug, dishwasher safe.", price: 2, image: "/products/mug.jpg" },
  { id: "tote-bag", name: "Canvas Tote Bag", description: "Reinforced canvas tote, perfect for groceries.", price: 1, image: "/products/tote.jpg" },
  { id: "poster", name: "Zone Map Poster", description: "24x36 poster of the Quai network zones. Looks great framed.", price: 2, image: "/products/poster.jpg" },
  { id: "keyboard", name: "Mechanical Keyboard", description: "Hot-swappable 75% keyboard with custom QUAI keycaps.", price: 3, image: "/products/keyboard.jpg" },
  { id: "hoodie-zip", name: "Zip Hoodie", description: "Lightweight zip-up hoodie with side pockets.", price: 3, image: "/products/zip-hoodie.jpg" },
  { id: "water-bottle", name: "Insulated Water Bottle", description: "20oz stainless steel bottle, keeps drinks cold 24h.", price: 2, image: "/products/bottle.jpg" },
  { id: "book", name: "The Quai Book", description: "Paperback intro to Quai Network and sharded blockchains.", price: 2, image: "/products/book.jpg" },
];

export function findProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}
