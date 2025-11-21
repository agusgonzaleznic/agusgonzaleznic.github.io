/**
 * Quick test script to verify Storyblok configuration
 * This file can be deleted after testing
 *
 * Run with: npx tsx src/lib/__test-storyblok.ts
 */

import { isStoryblokEnabled, getStoryblokRegion } from './storyblok';

console.log('=================================');
console.log('Storyblok Configuration Test');
console.log('=================================\n');

console.log('Environment Variables:');
console.log('- VITE_STORYBLOK_ACCESS_TOKEN:', process.env.VITE_STORYBLOK_ACCESS_TOKEN ? '✅ Set' : '❌ Not set');
console.log('- VITE_STORYBLOK_REGION:', process.env.VITE_STORYBLOK_REGION || 'Not set (defaults to EU)');
console.log();

console.log('Helper Functions:');
console.log('- isStoryblokEnabled():', isStoryblokEnabled() ? '✅ Enabled' : '❌ Disabled');
console.log('- getStoryblokRegion():', getStoryblokRegion());
console.log();

console.log('Expected Behavior:');
if (!isStoryblokEnabled()) {
  console.log('⚠️  Storyblok is disabled because VITE_STORYBLOK_ACCESS_TOKEN is not set');
  console.log('   This is expected if you haven\'t configured your token yet.');
  console.log('   The app will work normally but without CMS features.');
} else {
  console.log('✅ Storyblok is enabled and ready to use!');
}
console.log('\n=================================\n');
