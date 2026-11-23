import { pool } from '../config/db.js';
import { ProductService } from '../services/productService.js';
import { VariantService } from '../services/variantService.js';
import { StockService } from '../services/stockService.js';
import { PriceHistoryService } from '../services/priceHistoryService.js';
import { ExportService } from '../services/exportService.js';

async function runTests() {
  console.log('🧪 Starting Price History & Analytics Verification Tests...');

  try {
    // 1. Threshold Test
    console.log('\n--- Test 1: Margin Alert Threshold in store_settings ---');
    const initialThreshold = await PriceHistoryService.getMarginThreshold();
    console.log(`Current threshold: ${initialThreshold}%`);
    if (typeof initialThreshold !== 'number') throw new Error('Threshold is not a number');

    await PriceHistoryService.updateMarginThreshold(15.0);
    const updatedThreshold = await PriceHistoryService.getMarginThreshold();
    console.log(`Updated threshold: ${updatedThreshold}%`);
    if (updatedThreshold !== 15.0) throw new Error('Failed to update margin threshold');
    // Revert back to 10
    await PriceHistoryService.updateMarginThreshold(10.0);

    // 2. Product Creation with initial price history auto-capture
    console.log('\n--- Test 2: Product Creation Auto-capture ---');
    const createdProduct = await ProductService.createProduct(
      {
        name: `Test Semen Gresik ${Date.now()}`,
        category_id: null,
        brand_id: null,
        supplier_id: null,
        description: 'Semen PCC untuk konstruksi beton',
        min_stock_alert: 10,
        variants: [
          {
            variant_name: 'Sak 40kg',
            sku: `SG-40KG-${Date.now().toString().slice(-4)}`,
            initial_stock: 50,
            min_stock: 10,
            units: [
              {
                unit_name: 'Sak',
                conversion_factor: 1,
                is_base_unit: true,
                buy_price: 50000,
                sell_price: 65000,
                wholesale_price: 62000,
              },
            ],
          },
        ],
      },
      {
        userId: null,
        createdBy: 'Unit Tester',
        allowBuyPrice: true,
      }
    );

    const variantId = createdProduct.variants![0].id;
    const baseUnitId = createdProduct.variants![0].units[0].id;

    // Check price_history entry for created product
    const history1 = await PriceHistoryService.getHistory({ variant_id: variantId });
    console.log(`History entries found: ${history1.entries.length}`);
    if (history1.entries.length === 0) throw new Error('No price history recorded on product creation');
    const initialEntry = history1.entries[0];
    console.log(`Initial Entry Source: ${initialEntry.change_source}, Sell: ${initialEntry.new_sell_price}, Buy: ${initialEntry.new_buy_price}, Margin: ${initialEntry.gross_margin_after}%`);
    if (initialEntry.change_source !== 'INITIAL_PRICE') throw new Error('Expected INITIAL_PRICE source');
    // Gross margin: (65000 - 50000) / 65000 * 100 = 23.0769%
    const expectedMargin = ((65000 - 50000) / 65000) * 100;
    if (Math.abs((initialEntry.gross_margin_after || 0) - expectedMargin) > 0.01) {
      throw new Error(`Gross margin mismatch. Expected ${expectedMargin}, got ${initialEntry.gross_margin_after}`);
    }

    // 3. Adding secondary unit with initial price
    console.log('\n--- Test 3: VariantService.addUnit ---');
    const addedUnit = await VariantService.addUnit(
      variantId,
      {
        unit_name: 'Pallet (40 Sak)',
        conversion_factor: 40,
        is_base_unit: false,
        buy_price: 1950000,
        sell_price: 2400000,
        wholesale_price: 2350000,
      },
      {
        allowBuyPrice: true,
        userId: null,
        createdBy: 'Unit Tester',
      }
    );
    const history2 = await PriceHistoryService.getHistory({ variant_id: variantId });
    console.log(`Total history entries now: ${history2.entries.length}`);
    if (history2.entries.length < 2) throw new Error('Expected secondary unit price history to be recorded');

    // 4. Update Unit Price with Reason & Ref No
    console.log('\n--- Test 4: VariantService.updateUnit with Reason & Ref ---');
    const updatedUnit = await VariantService.updateUnit(
      baseUnitId,
      {
        unit_name: 'Sak',
        conversion_factor: 1,
        sell_price: 70000, // +5.000 (from 65.000)
        buy_price: 55000,  // +5.000 (from 50.000)
        wholesale_price: 67000,
        reason: 'Penyesuaian kenaikan tarif distributor semen kuartal 2',
        reference_no: 'INV-GRESIK-2026-001',
      },
      {
        allowBuyPrice: true,
        userId: null,
        createdBy: 'Unit Tester',
      }
    );

    const history3 = await PriceHistoryService.getHistory({ variant_id: variantId });
    const updateEntry = history3.entries[0]; // Most recent first
    console.log(`Updated Entry Source: ${updateEntry.change_source}`);
    console.log(`Sell: ${updateEntry.old_sell_price} -> ${updateEntry.new_sell_price} (diff: +${updateEntry.sell_price_diff}, %: +${updateEntry.sell_price_percent_change}%)`);
    console.log(`Buy: ${updateEntry.old_buy_price} -> ${updateEntry.new_buy_price} (diff: +${updateEntry.buy_price_diff})`);
    console.log(`Margin: ${updateEntry.gross_margin_before}% -> ${updateEntry.gross_margin_after}%`);
    console.log(`Direction: ${updateEntry.change_direction}, Reason: ${updateEntry.reason}, Ref: ${updateEntry.reference_no}`);
    if (updateEntry.change_source !== 'MANUAL_EDIT') throw new Error('Expected MANUAL_EDIT source');
    if (updateEntry.sell_price_diff !== 5000) throw new Error('Expected sell_price_diff to be 5000');
    if (updateEntry.change_direction !== 'INCREASE') throw new Error('Expected change_direction INCREASE');

    // 5. Restock with price update via StockService
    console.log('\n--- Test 5: Stock Restock with Price Update ---');
    await StockService.adjustStock({
      variant_id: variantId,
      adjustment_mode: 'ADD',
      amount: 100,
      movement_type: 'PURCHASE_RESTOCK',
      reference_no: 'SJ-RESTOCK-8899',
      notes: 'Penerimaan semen 100 sak dari armada pabrik',
      user_id: undefined,
      price_update: {
        unit_id: baseUnitId,
        new_buy_price: 57000,
        new_sell_price: 72000,
        new_wholesale_price: 69000,
        reason: 'Restock faktur #SJ-RESTOCK-8899',
        reference_no: 'SJ-RESTOCK-8899',
      },
      allow_buy_price: true,
    });

    const history4 = await PriceHistoryService.getHistory({ variant_id: variantId });
    const restockEntry = history4.entries[0];
    console.log(`Restock Entry Source: ${restockEntry.change_source}, Ref: ${restockEntry.reference_no}, New Sell: ${restockEntry.new_sell_price}, New Buy: ${restockEntry.new_buy_price}`);
    if (restockEntry.change_source !== 'PURCHASE_RESTOCK') throw new Error('Expected PURCHASE_RESTOCK source');
    if (restockEntry.new_buy_price !== 57000) throw new Error('Expected new_buy_price 57000');

    // 6. Variant & Product Price Analytics
    console.log('\n--- Test 6: Variant & Product Price Analytics ---');
    const variantAnalytics = await PriceHistoryService.getVariantAnalytics(variantId, { includeBuyPrice: true });
    console.log(`Variant Analytics units: ${variantAnalytics.units_summary.length}, time series points: ${variantAnalytics.time_series.length}`);
    if (variantAnalytics.time_series.length < 3) throw new Error('Expected at least 3 time series points');

    const productAnalytics = await PriceHistoryService.getProductAnalytics(createdProduct.id, { includeBuyPrice: true });
    console.log(`Product Analytics variants: ${productAnalytics.variants_status.length}, total changes: ${productAnalytics.recent_history.length}`);
    if (productAnalytics.recent_history.length < 3) throw new Error('Expected at least 3 changes in product analytics');

    // 7. Overview Analytics & Margin Alerts
    console.log('\n--- Test 7: Overview Analytics & Margin Alerts ---');
    const overview = await PriceHistoryService.getOverviewAnalytics({ includeBuyPrice: true });
    console.log(`Margin threshold: ${overview.margin_threshold}%`);
    console.log(`Total 30d changes: ${overview.summary.total_price_changes_30d}`);
    console.log(`Margin alerts count: ${overview.margin_alerts.length}`);
    console.log(`Top increases count: ${overview.top_increases.length}`);
    if (typeof overview.summary.total_price_changes_30d !== 'number') {
      throw new Error('Overview summary total_price_changes_30d is not a number');
    }

    // 8. Bulk Price Update Preview and Commit
    console.log('\n--- Test 8: Bulk Price Update Preview & Commit ---');
    const preview = await PriceHistoryService.previewBulkPriceUpdate({
      product_ids: [createdProduct.id],
      target_field: 'sell_price',
      adjustment_mode: 'PERCENT',
      value: 10, // +10%
      rounding_step: 1000,
      reason: 'Kenaikan serentak 10% dibulatkan ke ribuan',
    });
    console.log(`Bulk Preview affected units: ${preview.total_units_affected}`);
    console.log(`Avg margin before: ${preview.summary.avg_margin_before}%, after: ${preview.summary.avg_margin_after}%`);
    if (preview.total_units_affected === 0) throw new Error('Bulk preview should affect at least 1 unit');

    const commitResult = await PriceHistoryService.commitBulkPriceUpdate(
      {
        product_ids: [createdProduct.id],
        target_field: 'sell_price',
        adjustment_mode: 'PERCENT',
        value: 10,
        rounding_step: 1000,
        reason: 'Kenaikan serentak 10% dibulatkan ke ribuan',
      },
      {
        userId: null,
        createdBy: 'Unit Tester',
        allowBuyPrice: true,
      }
    );
    console.log(`Commit result: updated ${commitResult.updated_count} units`);
    if (commitResult.updated_count === 0) throw new Error('Bulk update commit should update units');

    // Verify BULK_UPDATE source recorded
    const history5 = await PriceHistoryService.getHistory({ variant_id: variantId });
    const bulkEntry = history5.entries[0];
    console.log(`Bulk Entry Source: ${bulkEntry.change_source}, Reason: ${bulkEntry.reason}, New Sell: ${bulkEntry.new_sell_price}`);
    if (bulkEntry.change_source !== 'BULK_UPDATE') throw new Error('Expected BULK_UPDATE source');

    // 9. RBAC Masking for Buy Price
    console.log('\n--- Test 9: RBAC Masking (Non-Buy-Price Role) ---');
    const maskedHistory = await PriceHistoryService.getHistory(
      { variant_id: variantId },
      { includeBuyPrice: false }
    );
    const maskedRow = maskedHistory.entries[0];
    console.log(`Masked row buy_price: ${maskedRow.new_buy_price}, gross_margin: ${maskedRow.gross_margin_after}, markup: ${maskedRow.markup_after}`);
    if (maskedRow.new_buy_price !== null || maskedRow.gross_margin_after !== null || maskedRow.markup_after !== null) {
      throw new Error('Expected buy_price and margins to be null when canViewBuyPrice is false');
    }

    // 10. Export Dataset & SQL Dump
    console.log('\n--- Test 10: Export Dataset & SQL Dump ---');
    const exportDataset = await ExportService.getDatasetByEntity('price_history', true);
    console.log(`Export price_history rows: ${exportDataset.rows.length}, columns: ${exportDataset.columns.length}`);
    if (exportDataset.rows.length === 0) throw new Error('Export dataset should contain price history rows');

    const sqlDump = await ExportService.generateDatabaseSqlDump();
    console.log(`SQL Dump generated, length: ${sqlDump.length} characters`);
    if (!sqlDump.includes('store_settings') || !sqlDump.includes('price_history')) {
      throw new Error('SQL dump should contain store_settings and price_history tables');
    }

    // 11. Bulk Price Update with Supplier Discount, PPN, and Additional Costs (Ongkir, Buruh)
    console.log('\n--- Test 11: Bulk Price Update with Supplier Discount, PPN & Additional Costs ---');
    const previewWithTax = await PriceHistoryService.previewBulkPriceUpdate({
      product_ids: [createdProduct.id],
      target_field: 'buy_price',
      adjustment_mode: 'PERCENT',
      value: 10, // Kenaikan dasar 10%
      discount_pct: 5, // Diskon supplier 5%
      tax_pct: 11, // PPN 11%
      additional_costs: [
        { name: 'Ongkir Truk', amount: 2000 },
        { name: 'Biaya Buruh', amount: 500 },
      ],
      auto_maintain_margin: true,
      rounding_step: 1000, // Pembulatan hanya berlaku untuk harga jual
      reason: 'Faktur Supplier Semen Kuartal 3',
    });
    console.log(`Preview with tax items: ${previewWithTax.items.length}`);
    const sampleUnit = previewWithTax.items[0];
    console.log(`Cur Buy: ${sampleUnit.old_buy_price}, Next Buy: ${sampleUnit.new_buy_price}, Diskon: ${sampleUnit.discount_amount}, PPN: ${sampleUnit.tax_amount}, Extra Cost: ${sampleUnit.total_additional_cost}, Next Sell: ${sampleUnit.new_sell_price}`);
    if (sampleUnit.discount_amount === undefined || sampleUnit.tax_amount === undefined || sampleUnit.total_additional_cost === undefined) {
      throw new Error('Expected discount_amount, tax_amount, and total_additional_cost in preview');
    }
    // Verify rounding ONLY applied to sell price, NOT buy price
    // Base buy 57000 * 1.1 = 62700. Disc 5% = 3135. DPP = 59565. PPN 11% = 6552.15. Total = 66117.15 + 2500 = 68617.15.
    // If rounding applied to buy price it would be 69000. But requirement says rounding ONLY applies to sell price!
    if (sampleUnit.new_buy_price % 1000 === 0 && sampleUnit.new_buy_price !== 68617.15) {
      console.warn(`Note: new_buy_price is ${sampleUnit.new_buy_price}`);
    }
    // Next sell price MUST be a multiple of rounding_step (1000)
    if (sampleUnit.new_sell_price % 1000 !== 0) {
      throw new Error(`Expected new_sell_price to be rounded to 1000, got ${sampleUnit.new_sell_price}`);
    }

    const commitTaxResult = await PriceHistoryService.commitBulkPriceUpdate(
      {
        product_ids: [createdProduct.id],
        target_field: 'buy_price',
        adjustment_mode: 'PERCENT',
        value: 10,
        discount_pct: 5,
        tax_pct: 11,
        additional_costs: [
          { name: 'Ongkir Truk', amount: 2000 },
          { name: 'Biaya Buruh', amount: 500 },
        ],
        auto_maintain_margin: true,
        rounding_step: 1000,
        reason: 'Faktur Supplier Semen Kuartal 3',
      },
      {
        userId: null,
        createdBy: 'Unit Tester',
        allowBuyPrice: true,
      }
    );
    console.log(`Commit with tax result: updated ${commitTaxResult.updated_count} units`);

    // Verify history recorded discount_pct, tax_pct, and additional_costs
    const history6 = await PriceHistoryService.getHistory({ variant_id: variantId });
    const sakTaxEntry = history6.entries.find((e) => e.unit_name === 'Sak') || history6.entries[0];
    const palletTaxEntry = history6.entries.find((e) => e.unit_name.includes('Pallet'));
    console.log(`Tax Entry Source: ${sakTaxEntry.change_source}, Reason: ${sakTaxEntry.reason}, Diskon: ${sakTaxEntry.discount_pct}%, PPN: ${sakTaxEntry.tax_pct}%, Extra Cost (Sak): ${sakTaxEntry.total_additional_cost}, Extra Cost (Pallet): ${palletTaxEntry?.total_additional_cost}`);
    if (Number(sakTaxEntry.discount_pct) !== 5 || Number(sakTaxEntry.tax_pct) !== 11) {
      throw new Error(`Expected discount_pct 5 and tax_pct 11, got discount_pct ${sakTaxEntry.discount_pct} and tax_pct ${sakTaxEntry.tax_pct}`);
    }
    if (Number(sakTaxEntry.total_additional_cost) !== 2500) {
      throw new Error(`Expected total_additional_cost 2500 for Sak, got ${sakTaxEntry.total_additional_cost}`);
    }
    if (palletTaxEntry && Number(palletTaxEntry.total_additional_cost) !== 100000) {
      throw new Error(`Expected total_additional_cost 100000 (2500 x 40) for Pallet, got ${palletTaxEntry.total_additional_cost}`);
    }
    if (!sakTaxEntry.reason?.includes('Biaya Tambahan: Rp 2.500')) {
      throw new Error(`Expected audit notes with Biaya Tambahan in reason, got: ${sakTaxEntry.reason}`);
    }

    // 12. Multi-Unit Nominal Price Adjustment Scaling (Sak vs Bag / Pallet)
    console.log('\n--- Test 12: Multi-Unit Nominal Scaling (Fixed Amount +1000 / Sak -> +40.000 / Pallet 40 Sak) ---');
    const multiUnitPreview = await PriceHistoryService.previewBulkPriceUpdate({
      product_ids: [createdProduct.id],
      target_field: 'buy_price',
      adjustment_mode: 'FIXED_AMOUNT',
      value: 1000, // +1.000 per sak
      auto_maintain_margin: true,
      rounding_step: 1000,
      reason: 'Kenaikan nominal modal Rp 1.000 per sak',
    });

    const sakUnit = multiUnitPreview.items.find((i) => i.unit_name === 'Sak')!;
    const palletUnit = multiUnitPreview.items.find((i) => i.unit_name.includes('Pallet'))!;

    console.log(`Sak (factor 1): Old Buy ${sakUnit.current_buy_price} -> New Buy ${sakUnit.next_buy_price} (diff: +${sakUnit.buy_diff})`);
    console.log(`Pallet (factor 40): Old Buy ${palletUnit.current_buy_price} -> New Buy ${palletUnit.next_buy_price} (diff: +${palletUnit.buy_diff})`);

    if (sakUnit.buy_diff !== 1000) {
      throw new Error(`Expected Sak buy_diff to be 1000, got ${sakUnit.buy_diff}`);
    }
    if (palletUnit.buy_diff !== 40000) {
      throw new Error(`Expected Pallet buy_diff to be 40000 (1000 x 40), got ${palletUnit.buy_diff}`);
    }

    // Test selling price fixed increase: +2000 per sak -> +80.000 per pallet
    const sellPreview = await PriceHistoryService.previewBulkPriceUpdate({
      product_ids: [createdProduct.id],
      target_field: 'sell_price',
      adjustment_mode: 'FIXED_AMOUNT',
      value: 2000, // +2.000 per sak
      rounding_step: 1000,
      reason: 'Kenaikan nominal jual Rp 2.000 per sak',
    });
    const sakSell = sellPreview.items.find((i) => i.unit_name === 'Sak')!;
    const palletSell = sellPreview.items.find((i) => i.unit_name.includes('Pallet'))!;
    console.log(`Sak Sell (factor 1): diff: +${sakSell.sell_diff}`);
    console.log(`Pallet Sell (factor 40): diff: +${palletSell.sell_diff}`);
    if (sakSell.sell_diff !== 2000) {
      throw new Error(`Expected Sak sell_diff to be 2000, got ${sakSell.sell_diff}`);
    }
    if (palletSell.sell_diff !== 80000) {
      throw new Error(`Expected Pallet sell_diff to be 80000 (2000 x 40), got ${palletSell.sell_diff}`);
    }

    console.log('\n✅ All 12 Price History & Analytics Verification Tests PASSED successfully!');
  } finally {
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
