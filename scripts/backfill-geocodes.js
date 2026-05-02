// One-shot backfill: geocode every address that has NULL lat/lng.
//
// Usage:
//   node scripts/backfill-geocodes.js             # dry run, prints what it would do
//   node scripts/backfill-geocodes.js --apply     # actually writes to the DB
//
// Why a script instead of a migration:
//   Nominatim's policy throttles us to 1 request/second. A migration that
//   takes minutes per address is a bad idea on Railway's deploy timeout.
//   This way we can run it manually once after seeding, and re-run it any
//   time we add seed data.
//
// Safety:
//   - Only operates on rows where latitude IS NULL OR longitude IS NULL
//   - Never deletes anything
//   - Logs every row it touches

require('dotenv').config();
const db = require('../src/config/database');
const { fromBin } = require('../src/utils/uuid');
const { geocode, buildAddressQuery } = require('../src/services/geocoding.service');

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`Backfill mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY RUN (no writes)'}`);
  console.log('');

  const rows = await db('address')
    .select(
      db.raw(fromBin('address_id')),
      'address_line1', 'city', 'state', 'zip_code', 'latitude', 'longitude'
    )
    .where(function () {
      this.whereNull('latitude').orWhereNull('longitude');
    });

  if (rows.length === 0) {
    console.log('No addresses missing coordinates. Done.');
    await db.destroy();
    return;
  }

  console.log(`Found ${rows.length} address(es) without coordinates.`);
  console.log('');

  let ok = 0;
  let miss = 0;
  for (const row of rows) {
    const query = buildAddressQuery(row);
    process.stdout.write(`  ${row.address_id}  ${query.padEnd(60).slice(0, 60)}  `);
    const coords = await geocode(query);
    if (!coords) {
      console.log('NO MATCH');
      miss++;
      continue;
    }
    console.log(`(${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
    if (APPLY) {
      await db('address')
        .whereRaw('address_id = uuid_to_bin(?)', [row.address_id])
        .update({ latitude: coords.lat, longitude: coords.lng });
    }
    ok++;
  }

  console.log('');
  console.log(`Geocoded:    ${ok}`);
  console.log(`No match:    ${miss}`);
  console.log(`Total seen:  ${rows.length}`);
  if (!APPLY && ok > 0) {
    console.log('');
    console.log('Re-run with --apply to write these coordinates to the database.');
  }
  await db.destroy();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
