// Test FPP Cached Status API (uses Node's built-in fetch)

(async () => {
  try {
    console.log('Testing GET /api/fpp/cached-status...\n');
    
    const response = await fetch('http://localhost:3000/api/fpp/cached-status');
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Headers:`);
    console.log(`  Cache-Control: ${response.headers.get('cache-control')}`);
    console.log(`  X-Cache-Age: ${response.headers.get('x-cache-age')}`);
    console.log(`  X-Cache-Stale: ${response.headers.get('x-cache-stale')}`);
    
    const data = await response.json();
    console.log(`\nResponse Body:`);
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message, error.cause?.code ?? error.cause ?? '');
  }
})();
