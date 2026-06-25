import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌿 Seeding CannaPay POS database...\n');

  // ── Clean existing data ──
  await prisma.auditLog.deleteMany();
  await prisma.cartHold.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.transactionItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.cashDrawerSession.deleteMany();
  await prisma.product.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.strain.deleteMany();
  await prisma.user.deleteMany();
  await prisma.location.deleteMany();

  // ── Location ──
  const location = await prisma.location.create({
    data: {
      name: 'CannaPay — Cape Town',
      address: '42 Long Street, Cape Town CBD, 8001',
      licenseNumber: 'CT-DISP-2024-0042',
    },
  });
  console.log(`📍 Location: ${location.name}`);

  // ── Users ──
  const passwordHash = await bcrypt.hash('password123', 12);
  
  const budtender = await prisma.user.create({
    data: {
      email: 'sipho@greenleaf.co.za',
      passwordHash,
      fullName: 'Sipho Ndlovu',
      pin: '123456',
      role: 'budtender',
      locationId: location.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'thandi@greenleaf.co.za',
      passwordHash,
      fullName: 'Thandi Mkhize',
      pin: '234567',
      role: 'shift_manager',
      locationId: location.id,
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'johan@greenleaf.co.za',
      passwordHash,
      fullName: 'Johan van der Merwe',
      pin: '345678',
      role: 'admin',
      locationId: location.id,
    },
  });
  console.log(`👤 Users: ${budtender.fullName} (budtender), ${manager.fullName} (manager), ${admin.fullName} (admin)`);

  // ── Strains ──
  const strainData = [
    { name: 'Wedding Cake', type: 'hybrid' as const, thcPercent: 24.0, cbdPercent: 0.1, terpeneProfile: 'Earthy, vanilla, sweet', aliases: ['wed cake', 'wedding', 'pink cookies'] },
    { name: 'Girl Scout Cookies', type: 'hybrid' as const, thcPercent: 22.0, cbdPercent: 0.2, terpeneProfile: 'Earthy, sweet, minty', aliases: ['gsc', 'cookies', 'scout'] },
    { name: 'Blue Dream', type: 'sativa' as const, thcPercent: 18.0, cbdPercent: 0.5, terpeneProfile: 'Berry, sweet, earthy', aliases: ['blue d', 'bd', 'azure'] },
    { name: 'OG Kush', type: 'hybrid' as const, thcPercent: 20.0, cbdPercent: 0.1, terpeneProfile: 'Pine, earthy, sour', aliases: ['og', 'kush', 'ogk'] },
    { name: 'Granddaddy Purple', type: 'indica' as const, thcPercent: 19.0, cbdPercent: 0.3, terpeneProfile: 'Grape, berry, sweet', aliases: ['gdp', 'purple', 'granddaddy'] },
    { name: 'Durban Poison', type: 'sativa' as const, thcPercent: 20.0, cbdPercent: 0.1, terpeneProfile: 'Pine, earthy, sweet', aliases: ['durban', 'dp', 'poison'] },
    { name: 'Gelato', type: 'hybrid' as const, thcPercent: 21.0, cbdPercent: 0.1, terpeneProfile: 'Sweet, creamy, fruity', aliases: ['gelato 33', 'larry bird'] },
    { name: 'Northern Lights', type: 'indica' as const, thcPercent: 18.0, cbdPercent: 0.4, terpeneProfile: 'Pine, earthy, sweet', aliases: ['nl', 'northern', 'lights'] },
    { name: 'Green Crack', type: 'sativa' as const, thcPercent: 17.0, cbdPercent: 0.2, terpeneProfile: 'Citrus, mango, fruity', aliases: ['green', 'crack', 'gc'] },
    { name: 'Bubba Kush', type: 'indica' as const, thcPercent: 19.0, cbdPercent: 0.2, terpeneProfile: 'Coffee, earthy, sweet', aliases: ['bubba', 'bk'] },
    { name: 'Sour Diesel', type: 'sativa' as const, thcPercent: 20.0, cbdPercent: 0.1, terpeneProfile: 'Diesel, citrus, sour', aliases: ['sour d', 'diesel', 'sd'] },
    { name: 'White Widow', type: 'hybrid' as const, thcPercent: 19.0, cbdPercent: 0.3, terpeneProfile: 'Earthy, pine, sweet', aliases: ['widow', 'white', 'ww'] },
    { name: 'AK-47', type: 'hybrid' as const, thcPercent: 20.0, cbdPercent: 0.2, terpeneProfile: 'Earthy, floral, sweet', aliases: ['ak', 'ak47'] },
    { name: 'Pineapple Express', type: 'hybrid' as const, thcPercent: 19.0, cbdPercent: 0.2, terpeneProfile: 'Pineapple, tropical, sweet', aliases: ['pineapple', 'express', 'pe'] },
    { name: 'Jack Herer', type: 'sativa' as const, thcPercent: 18.0, cbdPercent: 0.3, terpeneProfile: 'Pine, earthy, citrus', aliases: ['jack', 'herer', 'jh'] },
    { name: 'Cheese', type: 'hybrid' as const, thcPercent: 17.0, cbdPercent: 0.2, terpeneProfile: 'Cheese, earthy, sour', aliases: ['uk cheese', 'exodus'] },
    { name: 'Runtz', type: 'hybrid' as const, thcPercent: 22.0, cbdPercent: 0.1, terpeneProfile: 'Sweet, fruity, creamy', aliases: ['runtz og', 'white runtz'] },
    { name: 'Do-Si-Dos', type: 'indica' as const, thcPercent: 23.0, cbdPercent: 0.1, terpeneProfile: 'Earthy, floral, sweet', aliases: ['dosi', 'dosidos', 'dosi do'] },
    { name: 'Mimosa', type: 'sativa' as const, thcPercent: 19.0, cbdPercent: 0.2, terpeneProfile: 'Citrus, tropical, sweet', aliases: ['mimosa evo', 'clementine'] },
    { name: 'Zkittlez', type: 'indica' as const, thcPercent: 20.0, cbdPercent: 0.1, terpeneProfile: 'Berry, grape, fruity', aliases: ['zkittlez', 'skittles', 'zkittles'] },
  ];

  const strains = [];
  for (const s of strainData) {
    const strain = await prisma.strain.create({ data: s });
    strains.push(strain);
  }
  console.log(`🌱 Strains: ${strains.length} created`);

  // ── Batches ──
  const batchData = [
    { lotNumber: 'LOT-2026-WC-001', strainId: strains[0].id, supplier: 'Highveld Growers', productionDate: new Date('2026-05-15'), currentPotencyThc: 23.8, expirationDate: new Date('2027-05-15') },
    { lotNumber: 'LOT-2026-GSC-001', strainId: strains[1].id, supplier: 'Cape Cultivars', productionDate: new Date('2026-06-01'), currentPotencyThc: 21.5, expirationDate: new Date('2027-06-01') },
    { lotNumber: 'LOT-2026-BD-001', strainId: strains[2].id, supplier: 'Cape Cultivars', productionDate: new Date('2026-04-20'), currentPotencyThc: 17.8, expirationDate: new Date('2027-04-20') },
    { lotNumber: 'LOT-2026-OGK-001', strainId: strains[3].id, supplier: 'Highveld Growers', productionDate: new Date('2026-05-01'), currentPotencyThc: 19.5, expirationDate: new Date('2027-05-01') },
    { lotNumber: 'LOT-2026-GDP-001', strainId: strains[4].id, supplier: 'Durban Greens', productionDate: new Date('2026-03-10'), currentPotencyThc: 18.5, expirationDate: new Date('2027-03-10') },
    { lotNumber: 'LOT-2026-DP-001', strainId: strains[5].id, supplier: 'Durban Greens', productionDate: new Date('2026-05-20'), currentPotencyThc: 19.8, expirationDate: new Date('2027-05-20') },
    { lotNumber: 'LOT-2026-GEL-001', strainId: strains[6].id, supplier: 'Cape Cultivars', productionDate: new Date('2026-06-10'), currentPotencyThc: 20.5, expirationDate: new Date('2027-06-10') },
    { lotNumber: 'LOT-2026-NL-001', strainId: strains[7].id, supplier: 'Highveld Growers', productionDate: new Date('2026-02-28'), currentPotencyThc: 17.5, expirationDate: new Date('2027-02-28') },
    { lotNumber: 'LOT-2026-RUNTZ-001', strainId: strains[16].id, supplier: 'Cape Cultivars', productionDate: new Date('2026-06-15'), currentPotencyThc: 21.8, expirationDate: new Date('2027-06-15') },
    { lotNumber: 'LOT-2026-DOSI-001', strainId: strains[17].id, supplier: 'Durban Greens', productionDate: new Date('2026-04-01'), currentPotencyThc: 22.5, expirationDate: new Date('2027-04-01') },
  ];

  const batches = [];
  for (const b of batchData) {
    const batch = await prisma.batch.create({ data: b });
    batches.push(batch);
  }
  console.log(`📦 Batches: ${batches.length} created`);

  // ── Products ──
  const productData = [
    // Flower (weight-based)
    { sku: 'FLR-WC-3.5', name: 'Wedding Cake 3.5g', category: 'flower' as const, strainId: strains[0].id, batchId: batches[0].id, costPrice: 200, sellPrice: 350, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
    { sku: 'FLR-GSC-1', name: 'Girl Scout Cookies 1g', category: 'flower' as const, strainId: strains[1].id, batchId: batches[1].id, costPrice: 55, sellPrice: 100, unitType: 'gram' as const, weightGrams: 1.0, taxCategory: 'excise_flower' as const },
    { sku: 'FLR-GSC-3.5', name: 'Girl Scout Cookies 3.5g', category: 'flower' as const, strainId: strains[1].id, batchId: batches[1].id, costPrice: 190, sellPrice: 340, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
    { sku: 'FLR-BD-3.5', name: 'Blue Dream 3.5g', category: 'flower' as const, strainId: strains[2].id, batchId: batches[2].id, costPrice: 180, sellPrice: 320, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
    { sku: 'FLR-BD-7', name: 'Blue Dream 7g', category: 'flower' as const, strainId: strains[2].id, batchId: batches[2].id, costPrice: 340, sellPrice: 600, unitType: 'quarter' as const, weightGrams: 7.0, taxCategory: 'excise_flower' as const },
    { sku: 'FLR-OGK-3.5', name: 'OG Kush 3.5g', category: 'flower' as const, strainId: strains[3].id, batchId: batches[3].id, costPrice: 195, sellPrice: 350, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
    { sku: 'FLR-GDP-3.5', name: 'Granddaddy Purple 3.5g', category: 'flower' as const, strainId: strains[4].id, batchId: batches[4].id, costPrice: 180, sellPrice: 320, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
    { sku: 'FLR-DP-3.5', name: 'Durban Poison 3.5g', category: 'flower' as const, strainId: strains[5].id, batchId: batches[5].id, costPrice: 170, sellPrice: 300, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
    { sku: 'FLR-GEL-3.5', name: 'Gelato 3.5g', category: 'flower' as const, strainId: strains[6].id, batchId: batches[6].id, costPrice: 210, sellPrice: 380, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
    { sku: 'FLR-NL-3.5', name: 'Northern Lights 3.5g', category: 'flower' as const, strainId: strains[7].id, batchId: batches[7].id, costPrice: 170, sellPrice: 300, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
    { sku: 'FLR-RUNTZ-3.5', name: 'Runtz 3.5g', category: 'flower' as const, strainId: strains[16].id, batchId: batches[8].id, costPrice: 220, sellPrice: 400, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
    { sku: 'FLR-DOSI-3.5', name: 'Do-Si-Dos 3.5g', category: 'flower' as const, strainId: strains[17].id, batchId: batches[9].id, costPrice: 230, sellPrice: 420, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
    // Pre-rolls
    { sku: 'PRE-WC-1', name: 'Wedding Cake Pre-Roll', category: 'pre_roll' as const, strainId: strains[0].id, batchId: batches[0].id, costPrice: 45, sellPrice: 80, unitType: 'each' as const, weightGrams: 0.75, taxCategory: 'excise_flower' as const },
    { sku: 'PRE-GSC-1', name: 'GSC Pre-Roll', category: 'pre_roll' as const, strainId: strains[1].id, batchId: batches[1].id, costPrice: 45, sellPrice: 80, unitType: 'each' as const, weightGrams: 0.75, taxCategory: 'excise_flower' as const },
    { sku: 'PRE-BD-1', name: 'Blue Dream Pre-Roll', category: 'pre_roll' as const, strainId: strains[2].id, batchId: batches[2].id, costPrice: 40, sellPrice: 75, unitType: 'each' as const, weightGrams: 0.75, taxCategory: 'excise_flower' as const },
    { sku: 'PRE-OGK-1', name: 'OG Kush Pre-Roll', category: 'pre_roll' as const, strainId: strains[3].id, batchId: batches[3].id, costPrice: 45, sellPrice: 80, unitType: 'each' as const, weightGrams: 0.75, taxCategory: 'excise_flower' as const },
    // Vapes
    { sku: 'VAP-WC-1', name: 'Wedding Cake Cart 1g', category: 'vape' as const, strainId: strains[0].id, batchId: batches[0].id, costPrice: 250, sellPrice: 450, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
    { sku: 'VAP-GSC-1', name: 'GSC Cart 1g', category: 'vape' as const, strainId: strains[1].id, batchId: batches[1].id, costPrice: 250, sellPrice: 450, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
    { sku: 'VAP-BD-1', name: 'Blue Dream Cart 1g', category: 'vape' as const, strainId: strains[2].id, batchId: batches[2].id, costPrice: 240, sellPrice: 430, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
    { sku: 'VAP-GEL-1', name: 'Gelato Cart 1g', category: 'vape' as const, strainId: strains[6].id, batchId: batches[6].id, costPrice: 260, sellPrice: 480, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
    // Edibles
    { sku: 'EDB-GUM-10', name: 'Sour Cherry Gummies 10pk', category: 'edible' as const, strainId: strains[4].id, batchId: batches[4].id, costPrice: 120, sellPrice: 250, unitType: 'each' as const, taxCategory: 'excise_edible' as const },
    { sku: 'EDB-CHOC-1', name: 'Dark Chocolate Bar 100mg', category: 'edible' as const, strainId: strains[7].id, batchId: batches[7].id, costPrice: 150, sellPrice: 300, unitType: 'each' as const, taxCategory: 'excise_edible' as const },
    { sku: 'EDB-BROWN-1', name: 'Infused Brownie', category: 'edible' as const, strainId: strains[16].id, batchId: batches[8].id, costPrice: 80, sellPrice: 180, unitType: 'each' as const, taxCategory: 'excise_edible' as const },
    // Concentrates
    { sku: 'CON-WAX-WC', name: 'Wedding Cake Live Resin 1g', category: 'concentrate' as const, strainId: strains[0].id, batchId: batches[0].id, costPrice: 300, sellPrice: 550, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
    { sku: 'CON-SHAT-GSC', name: 'GSC Shatter 1g', category: 'concentrate' as const, strainId: strains[1].id, batchId: batches[1].id, costPrice: 280, sellPrice: 500, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
    // Accessories
    { sku: 'ACC-LIGHTER', name: 'Clipper Lighter', category: 'accessory' as const, costPrice: 15, sellPrice: 30, unitType: 'each' as const, taxCategory: 'standard' as const },
    { sku: 'ACC-GRINDER', name: '4-Piece Grinder', category: 'accessory' as const, costPrice: 80, sellPrice: 150, unitType: 'each' as const, taxCategory: 'standard' as const },
    { sku: 'ACC-PAPERS', name: 'RAW Rolling Papers', category: 'accessory' as const, costPrice: 10, sellPrice: 25, unitType: 'each' as const, taxCategory: 'standard' as const },
    { sku: 'ACC-TIPS', name: 'RAW Filter Tips', category: 'accessory' as const, costPrice: 8, sellPrice: 20, unitType: 'each' as const, taxCategory: 'standard' as const },
    { sku: 'ACC-TUBE', name: 'Doob Tube (5 pack)', category: 'accessory' as const, costPrice: 20, sellPrice: 45, unitType: 'each' as const, taxCategory: 'standard' as const },
  ];

  const products = [];
  for (const p of productData) {
    const product = await prisma.product.create({ data: p });
    products.push(product);
  }
  console.log(`📦 Products: ${products.length} created`);

  // ── Inventory ──
  const inventoryData = [
    { productId: products[0].id, quantity: 25 },  { productId: products[1].id, quantity: 50 },
    { productId: products[2].id, quantity: 30 },  { productId: products[3].id, quantity: 20 },
    { productId: products[4].id, quantity: 15 },  { productId: products[5].id, quantity: 35 },
    { productId: products[6].id, quantity: 18 },  { productId: products[7].id, quantity: 40 },
    { productId: products[8].id, quantity: 22 },  { productId: products[9].id, quantity: 28 },
    { productId: products[10].id, quantity: 12 }, { productId: products[11].id, quantity: 8 },
    { productId: products[12].id, quantity: 40 }, { productId: products[13].id, quantity: 35 },
    { productId: products[14].id, quantity: 30 }, { productId: products[15].id, quantity: 25 },
    { productId: products[16].id, quantity: 15 }, { productId: products[17].id, quantity: 20 },
    { productId: products[18].id, quantity: 18 }, { productId: products[19].id, quantity: 24 },
    { productId: products[20].id, quantity: 20 }, { productId: products[21].id, quantity: 15 },
    { productId: products[22].id, quantity: 8 },  { productId: products[23].id, quantity: 6 },
    { productId: products[24].id, quantity: 10 }, { productId: products[25].id, quantity: 30 },
    { productId: products[26].id, quantity: 15 }, { productId: products[27].id, quantity: 25 },
    { productId: products[28].id, quantity: 50 }, { productId: products[29].id, quantity: 40 },
  ];

  for (const inv of inventoryData) {
    await prisma.inventory.create({
      data: {
        productId: inv.productId,
        locationId: location.id,
        quantity: inv.quantity,
        reorderPoint: 5,
      },
    });
  }
  console.log(`📊 Inventory: ${inventoryData.length} stock entries created`);

  console.log('\n✅ Seed complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test credentials:');
  console.log('  Budtender: sipho@greenleaf.co.za / password123 / PIN: 123456');
  console.log('  Manager:   thandi@greenleaf.co.za / password123 / PIN: 234567');
  console.log('  Admin:     johan@greenleaf.co.za / password123 / PIN: 345678');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
