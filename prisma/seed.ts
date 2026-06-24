import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const products = [
  {
    externalId: "farma-toothbrush-colgate-basic",
    title: "Escova Dental Colgate Classic Limpeza Eficiente",
    brand: "Colgate",
    category: "escova de dente",
    price: 7.9,
    shippingPrice: 5.9,
    store: "Drogaria Central",
    rating: 4.5,
    deliveryEstimate: "Hoje, em ate 3 horas",
    deliveryHours: 3,
    imageUrl: "https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=600&q=80",
    productUrl: "https://example.com/colgate-classic",
    availability: true
  },
  {
    externalId: "market-toothbrush-curaprox-5460",
    title: "Escova Dental Curaprox 5460 Ultra Macia",
    brand: "Curaprox",
    category: "escova de dente",
    price: 34.9,
    shippingPrice: 8.9,
    store: "Amazon Mock",
    rating: 4.9,
    deliveryEstimate: "Amanha",
    deliveryHours: 24,
    imageUrl: "https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?auto=format&fit=crop&w=600&q=80",
    productUrl: "https://example.com/curaprox-5460",
    availability: true
  },
  {
    externalId: "farma-toothbrush-oralb-pro",
    title: "Escova Dental Oral-B Pro-Saude Macia",
    brand: "Oral-B",
    category: "escova de dente",
    price: 12.5,
    shippingPrice: 4.9,
    store: "Farmacia Rapida",
    rating: 4.7,
    deliveryEstimate: "Hoje, em ate 90 min",
    deliveryHours: 2,
    imageUrl: "https://images.unsplash.com/photo-1556228724-4f4f94612c19?auto=format&fit=crop&w=600&q=80",
    productUrl: "https://example.com/oralb-pro",
    availability: true
  },
  {
    externalId: "market-toothpaste-colgate-total",
    title: "Creme Dental Colgate Total 12 90g",
    brand: "Colgate",
    category: "pasta de dente",
    price: 9.49,
    shippingPrice: 4.9,
    store: "Drogaria Central",
    rating: 4.8,
    deliveryEstimate: "Hoje",
    deliveryHours: 4,
    imageUrl: "https://images.unsplash.com/photo-1571115764595-644a1f56a55c?auto=format&fit=crop&w=600&q=80",
    productUrl: "https://example.com/colgate-total",
    availability: true
  },
  {
    externalId: "market-toothpaste-sorriso-cheap",
    title: "Creme Dental Sorriso Limpeza Completa 90g",
    brand: "Sorriso",
    category: "pasta de dente",
    price: 4.99,
    shippingPrice: 5.9,
    store: "Supermercado Bairro",
    rating: 4.2,
    deliveryEstimate: "Hoje",
    deliveryHours: 5,
    imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=600&q=80",
    productUrl: "https://example.com/sorriso",
    availability: true
  },
  {
    externalId: "beauty-shampoo-pantene",
    title: "Shampoo Pantene Hidratacao 400ml",
    brand: "Pantene",
    category: "shampoo",
    price: 21.9,
    shippingPrice: 6.9,
    store: "Mercado Livre Mock",
    rating: 4.7,
    deliveryEstimate: "Amanha",
    deliveryHours: 24,
    imageUrl: "https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=600&q=80",
    productUrl: "https://example.com/pantene",
    availability: true
  },
  {
    externalId: "beauty-shampoo-seda",
    title: "Shampoo Seda Cachos Definidos 325ml",
    brand: "Seda",
    category: "shampoo",
    price: 13.9,
    shippingPrice: 7.9,
    store: "Supermercado Bairro",
    rating: 4.3,
    deliveryEstimate: "Hoje",
    deliveryHours: 6,
    imageUrl: "https://images.unsplash.com/photo-1620916297397-a4a5402a3c6c?auto=format&fit=crop&w=600&q=80",
    productUrl: "https://example.com/seda",
    availability: true
  },
  {
    externalId: "home-tissue-kleenex-fast",
    title: "Lenco de Papel Kleenex Folha Dupla 50 un",
    brand: "Kleenex",
    category: "lenco de papel",
    price: 8.99,
    shippingPrice: 3.9,
    store: "Farmacia Rapida",
    rating: 4.6,
    deliveryEstimate: "Hoje, em ate 2 horas",
    deliveryHours: 2,
    imageUrl: "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?auto=format&fit=crop&w=600&q=80",
    productUrl: "https://example.com/kleenex",
    availability: true
  }
];

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

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
