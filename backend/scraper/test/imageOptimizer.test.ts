import sharp from 'sharp';
import { ImageOptimizer } from '../src/services/imageOptimizer';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function testImageOptimizer() {
  console.log('Testing Sharp Image Optimization Engine...');

  const optimizer = new ImageOptimizer({ maxDimension: 500, quality: 80 });

  // Generate a test JPEG image buffer (1200x800 red square)
  const testInputBuffer = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 220, g: 30, b: 50 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();

  const originalSize = testInputBuffer.length;
  console.log(`Original test image size: ${(originalSize / 1024).toFixed(2)} KB`);

  // Run optimizer
  const result = await optimizer.optimize(testInputBuffer);

  assert(result.contentType === 'image/webp', 'Output content type should be image/webp');
  assert(result.ext === 'webp', 'Extension should be webp');
  assert(result.buffer.length < originalSize, 'Optimized image must be lighter than original');

  // Verify dimensions of the optimized WebP
  const meta = await sharp(result.buffer).metadata();
  assert(meta.format === 'webp', 'Sharp metadata format should be webp');
  assert((meta.width || 0) <= 500, `Width (${meta.width}) should be <= 500px`);
  assert((meta.height || 0) <= 500, `Height (${meta.height}) should be <= 500px`);

  console.log(
    `Optimized test image size: ${(result.buffer.length / 1024).toFixed(2)} KB (-${result.compressionRatio}%)`
  );
  console.log('✅ Sharp Image Optimization test passed successfully!');
}

testImageOptimizer().catch((err) => {
  console.error('❌ Image optimization test failed:', err);
  process.exit(1);
});
