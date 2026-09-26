/**
 * Regression tests for profile updates.
 *
 * The frontend had to leave cleared fields out of the request because the
 * schema rejected an empty string, so a farmer who deleted a saved value was
 * told "Profile saved" while the old one stayed. An empty value now unsets it.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert');

const { _buildProfileUpdate: buildProfileUpdate } = require('../src/controllers/user.controller');

test('an empty value unsets the stored field', () => {
  const update = buildProfileUpdate({ fullName: 'Asha', email: '' });
  assert.deepStrictEqual(update, { $set: { fullName: 'Asha' }, $unset: { email: '' } });
});

test('nested fields are set individually so siblings survive', () => {
  const update = buildProfileUpdate({
    address: { village: 'Kothrud', pincode: '' },
    farmDetails: { primaryCrop: 'Wheat', soilType: 'Loam', totalArea: null },
  });
  assert.deepStrictEqual(update, {
    $set: {
      'address.village': 'Kothrud',
      'farmDetails.primaryCrop': 'Wheat',
      'farmDetails.soilType': 'Loam',
    },
    $unset: { 'address.pincode': '', 'farmDetails.totalArea': '' },
  });
});

test('arrays are set whole rather than flattened', () => {
  const update = buildProfileUpdate({ farmDetails: { crops: ['Wheat', 'Rice'] } });
  assert.deepStrictEqual(update, { $set: { 'farmDetails.crops': ['Wheat', 'Rice'] } });
});
