import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedProduct = {
  category: string;
  title: string;
  brand: string;
  basePrice: number;
  imageUrl: string;
};

const catalog: SeedProduct[] = [
  {
    category: "escova de dente",
    title: "Escova Dental Macia",
    brand: "Colgate",
    basePrice: 9.9,
    imageUrl: "https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=600&q=80"
  },
  {
    category: "pasta de dente",
    title: "Creme Dental Protecao Total 90g",
    brand: "Colgate",
    basePrice: 8.9,
    imageUrl: "https://images.unsplash.com/photo-1571115764595-644a1f56a55c?auto=format&fit=crop&w=600&q=80"
  },
  {
    category: "lenco de papel",
    title: "Lenco de Papel Folha Dupla 50 un",
    brand: "Kleenex",
    basePrice: 7.9,
    imageUrl: "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?auto=format&fit=crop&w=600&q=80"
  },
  {
    category: "shampoo",
    title: "Shampoo Hidratacao 400ml",
    brand: "Pantene",
    basePrice: 21.9,
    imageUrl: "https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=600&q=80"
  },
  {
    category: "protetor solar",
    title: "Protetor Solar FPS 50 120ml",
    brand: "Nivea",
    basePrice: 42.9,
    imageUrl: "https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=600&q=80"
  },
  {
    category: "desodorante",
    title: "Desodorante Aerosol 150ml",
    brand: "Rexona",
    basePrice: 15.9,
    imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=600&q=80"
  },
  {
    category: "carregador",
    title: "Carregador USB-C 20W",
    brand: "Anker",
    basePrice: 59.9,
    imageUrl: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80"
  },
  {
    category: "pilhas",
    title: "Pilha Alcalina AA com 4 unidades",
    brand: "Duracell",
    basePrice: 24.9,
    imageUrl: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=600&q=80"
  },
  {
    category: "agua",
    title: "Agua Mineral sem Gas 1,5L",
    brand: "Crystal",
    basePrice: 4.5,
    imageUrl: "https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=600&q=80"
  },
  {
    category: "chocolate",
    title: "Chocolate ao Leite 90g",
    brand: "Lacta",
    basePrice: 6.9,
    imageUrl: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?auto=format&fit=crop&w=600&q=80"
  }
];

const sources = [
  {
    source: "mercado_livre",
    sourceType: "marketplace",
    store: "Mercado Livre Mock",
    fulfillmentMode: "marketplace_native",
    automationLevel: "mock_api",
    priceFactor: 0.95,
    shipping: 9.9,
    hours: 24,
    estimate: "Amanha ou depois",
    rating: 4.6
  },
  {
    source: "rappi",
    sourceType: "on_demand_marketplace",
    store: "Rappi Mock",
    fulfillmentMode: "marketplace_native",
    automationLevel: "mock_partner",
    priceFactor: 1.08,
    shipping: 8.9,
    hours: 2,
    estimate: "Hoje, em ate 2 horas",
    rating: 4.7
  },
  {
    source: "farmacia",
    sourceType: "pharmacy",
    store: "Farmacia Rapida",
    fulfillmentMode: "marketplace_native",
    automationLevel: "mock_partner",
    priceFactor: 1.03,
    shipping: 5.9,
    hours: 3,
    estimate: "Hoje, em ate 3 horas",
    rating: 4.8
  },
  {
    source: "loja_local",
    sourceType: "local_store",
    store: "Loja Local Centro",
    fulfillmentMode: "local_courier",
    automationLevel: "manual",
    priceFactor: 1.12,
    shipping: 6.9,
    hours: 1,
    estimate: "Hoje, em ate 60 min",
    rating: 4.4
  }
];

const products = catalog.flatMap((item) =>
  sources.map((source) => ({
    externalId: `${source.source}-${slug(item.category)}-${slug(item.brand)}`,
    title: `${item.title} - ${source.store}`,
    brand: item.brand,
    category: item.category,
    source: source.source,
    sourceType: source.sourceType,
    fulfillmentMode: source.fulfillmentMode,
    automationLevel: source.automationLevel,
    price: round(item.basePrice * source.priceFactor),
    shippingPrice: source.shipping,
    store: source.store,
    rating: source.rating,
    deliveryEstimate: source.estimate,
    deliveryHours: source.hours,
    imageUrl: item.imageUrl,
    productUrl: `https://example.com/${source.source}/${slug(item.category)}`,
    availability: true
  }))
);

async function main() {
  for (const product of products) {
    await prisma.product.upsert({
      where: { externalId: product.externalId },
      update: product,
      create: product
    });
  }

  await prisma.user.upsert({
    where: { phone: "+5511999990000" },
    update: {},
    create: {
      name: "Cliente Demo",
      phone: "+5511999990000",
      email: "cliente@demo.local",
      defaultAddress: "Rua das Flores, 123 - Sao Paulo, SP"
    }
  });
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
