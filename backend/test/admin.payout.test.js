/**
 * Tests for the admin payout release and the "Disbursed" dashboard figure.
 *
 * Nothing used to mark a payout as paid, so the dashboard's disbursed total
 * could only ever read 0. A payout now counts once an admin explicitly
 * releases it, and not before.
 *
 * The Claim, AdminAction and Notification model statics are replaced with an
 * in-memory store, so no database is needed.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const Claim = require('../src/models/Claim');
const User = require('../src/models/User');
const AdminAction = require('../src/models/AdminAction');
const Notification = require('../src/models/Notification');
const ctrl = require('../src/controllers/admin.controller');

const adminId = new mongoose.Types.ObjectId();

const matches = (doc, filter) =>
  Object.entries(filter).every(([key, cond]) => {
    if (key === '_id') return String(doc._id) === String(cond);
    if (cond && typeof cond === 'object' && '$gt' in cond) return doc[key] > cond.$gt;
    return doc[key] === cond;
  });

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
};

const install = (claims) => {
  const actions = [];
  const notifications = [];
  Claim.findOneAndUpdate = async (filter, update) => {
    const doc = claims.find((c) => matches(c, filter));
    if (!doc) return null;
    Object.assign(doc, update.$set);
    return doc;
  };
  Claim.findById = async (id) => claims.find((c) => String(c._id) === String(id)) || null;
  Claim.countDocuments = async () => claims.length;
  Claim.aggregate = async ([first, second]) => {
    if (first.$group) {
      const counts = {};
      for (const c of claims) counts[c.status] = (counts[c.status] || 0) + 1;
      return Object.entries(counts).map(([_id, count]) => ({ _id, count }));
    }
    const matched = claims.filter((c) => matches(c, first.$match));
    if (!matched.length) return [];
    assert.deepStrictEqual(second.$group, { _id: null, total: { $sum: '$payoutAmount' }, count: { $sum: 1 } });
    return [{ _id: null, total: matched.reduce((sum, c) => sum + c.payoutAmount, 0), count: matched.length }];
  };
  Claim.find = () => ({ sort: () => ({ limit: () => ({ populate: async () => [] }) }) });
  User.countDocuments = async () => 0;
  AdminAction.create = async (doc) => actions.push(doc);
  Notification.create = async (doc) => notifications.push(doc);
  return { actions, notifications };
};

const claim = (overrides) => ({
  _id: new mongoose.Types.ObjectId(),
  documentId: 'CLM-1',
  userId: new mongoose.Types.ObjectId(),
  status: 'approved',
  payoutAmount: 45000,
  payoutStatus: 'pending',
  ...overrides,
});

const release = async (target) => {
  const res = fakeRes();
  await ctrl.releasePayout({ params: { id: String(target._id) }, user: { _id: adminId }, ip: '127.0.0.1' }, res);
  return res;
};

const dashboard = async () => {
  const res = fakeRes();
  await ctrl.dashboardStats({}, res);
  return res.body.stats;
};

test('an approved payout is not counted as disbursed until an admin releases it', async () => {
  const approved = claim();
  install([approved]);

  let stats = await dashboard();
  assert.strictEqual(stats.totalPayout, 0);
  assert.strictEqual(stats.paidClaims, 0);

  const res = await release(approved);
  assert.strictEqual(res.statusCode, 200);

  stats = await dashboard();
  assert.strictEqual(stats.totalPayout, 45000);
  assert.strictEqual(stats.paidClaims, 1);
});

test('releasing records who released the payout and when, and tells the farmer', async () => {
  const approved = claim();
  const { actions, notifications } = install([approved]);
  const before = Date.now();

  await release(approved);

  assert.strictEqual(approved.status, 'payout_complete');
  assert.strictEqual(approved.payoutStatus, 'completed');
  assert.strictEqual(String(approved.payoutReleasedBy), String(adminId));
  assert.ok(approved.payoutDate instanceof Date && approved.payoutDate.getTime() >= before);

  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].action, 'process_payout');
  assert.strictEqual(String(actions[0].adminId), String(adminId));
  assert.strictEqual(actions[0].details.payoutAmount, 45000);

  assert.strictEqual(notifications.length, 1);
  assert.strictEqual(String(notifications[0].userId), String(approved.userId));
});

test('a payout cannot be released twice', async () => {
  const approved = claim();
  const { actions } = install([approved]);

  await release(approved);
  const again = await release(approved);

  assert.strictEqual(again.statusCode, 409);
  assert.strictEqual(actions.length, 1);
  assert.strictEqual((await dashboard()).paidClaims, 1);
});

test('only an approved claim with a non-zero pending payout can be released', async () => {
  const blocked = [
    claim({ status: 'manual_review', payoutAmount: 0, payoutStatus: 'none' }),
    claim({ status: 'rejected', payoutAmount: 0, payoutStatus: 'none' }),
    claim({ status: 'approved', payoutAmount: 0, payoutStatus: 'none' }),
  ];
  const { actions, notifications } = install(blocked);

  for (const c of blocked) {
    const before = { ...c };
    const res = await release(c);
    assert.strictEqual(res.statusCode, 409, `${c.status} with ${c.payoutAmount} must not be released`);
    assert.strictEqual(res.body.success, false);
    assert.deepStrictEqual(c, before);
  }
  assert.strictEqual(actions.length, 0);
  assert.strictEqual(notifications.length, 0);
  assert.strictEqual((await dashboard()).totalPayout, 0);
});

test('releasing an unknown claim is a 404', async () => {
  install([]);
  const res = await release(claim());
  assert.strictEqual(res.statusCode, 404);
});

test('a released payout still counts as an approved claim', async () => {
  const approved = claim();
  install([approved, claim({ status: 'rejected', payoutAmount: 0, payoutStatus: 'none' })]);

  assert.strictEqual((await dashboard()).approvedClaims, 1);
  await release(approved);
  assert.strictEqual((await dashboard()).approvedClaims, 1);
});

test('a failed audit write does not report a committed release as a failure', async () => {
  const approved = claim();
  install([approved]);
  AdminAction.create = async () => {
    throw new Error('audit store unavailable');
  };

  const res = await release(approved);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(approved.status, 'payout_complete');
});
