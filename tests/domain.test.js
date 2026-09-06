import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKeyword, validatePrompt, calculateEarnings, monetizationProgress } from '../lib/domain.js';
test('normalizes keyword casing and Unicode spacing', () => assert.equal(normalizeKeyword('  SAREE  '), 'saree'));
test('supports Devanagari keyword', () => assert.equal(validatePrompt({keyword:'साड़ी',title:'Saree',body:'prompt',status:'draft'}).keyword, 'साड़ी'));
test('rejects unsafe keyword spaces', () => assert.throws(() => validatePrompt({keyword:'saree look',title:'Saree',body:'prompt',status:'draft'})));
test('calculates earnings transparently', () => assert.deepEqual(calculateEarnings({pageViews:10000,slots:1,fillRate:70,ecpm:1,creatorShare:50}), {impressions:7000,revenue:7,creator:3.5,platform:3.5}));
test('does not enable monetization until both thresholds are met', () => assert.equal(monetizationProgress({publishedPrompts:10,measuredVisitors:4999}).status, 'not_eligible'));
test('sends qualifying creators to review, not payout', () => assert.equal(monetizationProgress({publishedPrompts:10,measuredVisitors:5000}).status, 'eligible_for_review'));
