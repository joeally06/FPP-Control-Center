// Capture the schema/defaults previously added at application import. Keep this
// migration and lib/db-schema.ts unchanged after release; add future migrations.
module.exports = function migrate(db) {
  require('esbuild-register');
  require('../lib/db-schema.ts').applySchema(db);
};
