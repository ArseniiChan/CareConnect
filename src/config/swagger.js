// Swagger setup — serves the OpenAPI doc at /api/docs.
//
// Path resilience: the YAML file's location varies by build context. Locally
// it lives at <repo>/docs/swagger.yaml. On Railway/railpack, the .dockerignore
// negation rule (`!docs/swagger.yaml`) flattens it into the build root, so it
// ends up at /app/swagger.yaml — not /app/docs/swagger.yaml. Try the likely
// locations and use the first one that loads.

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const fs = require('fs');

const CANDIDATE_PATHS = [
  path.join(__dirname, '../../docs/swagger.yaml'),  // local dev / repo layout
  path.join(__dirname, '../../swagger.yaml'),       // railpack flat layout
  path.join(process.cwd(), 'docs/swagger.yaml'),    // pwd-relative, repo
  path.join(process.cwd(), 'swagger.yaml'),         // pwd-relative, flat
];

function setupSwagger(app) {
  const found = CANDIDATE_PATHS.find((p) => fs.existsSync(p));
  if (!found) {
    console.warn(
      `Swagger docs not found in any of: ${CANDIDATE_PATHS.join(', ')} — /api/docs will be unavailable`
    );
    return;
  }
  try {
    const swaggerDocument = YAML.load(found);
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'CareConnect API Documentation',
    }));
    console.log(`Swagger UI mounted at /api/docs (loaded from ${found})`);
  } catch (err) {
    console.warn(`Swagger docs found at ${found} but failed to parse: ${err.message}`);
  }
}

module.exports = setupSwagger;
