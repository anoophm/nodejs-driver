/**
 * Copyright (C) 2016-2017 DataStax, Inc.
 *
 * Please see the license for details:
 * http://www.datastax.com/terms/datastax-dse-driver-license-terms
 */
'use strict';
const assert = require('assert');
const types = require('../../lib/types');
const policies = require('../../lib/policies');
const helper = require('../test-helper');
const RetryPolicy = policies.retry.RetryPolicy;
const IdempotenceAwareRetryPolicy = policies.retry.IdempotenceAwareRetryPolicy;
const FallthroughRetryPolicy = policies.retry.FallthroughRetryPolicy;

describe('RetryPolicy', function () {
  describe('#onUnavailable()', function () {
    it('should retry on the next host the first time', function () {
      const policy = new RetryPolicy();
      const result = policy.onUnavailable(getRequestInfo(0), types.consistencies.one, 3, 3);
      assert.strictEqual(result.consistency, undefined);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.retry);
      assert.strictEqual(result.useCurrentHost, false);
    });
    it('should rethrow the following times', function () {
      const policy = new RetryPolicy();
      const result = policy.onUnavailable(getRequestInfo(1), types.consistencies.one, 3, 3);
      assert.strictEqual(result.consistency, undefined);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.rethrow);
    });
  });
  describe('#onWriteTimeout()', function () {
    it('should retry on the same host the first time when writeType is BATCH_LOG', function () {
      const policy = new RetryPolicy();
      const result = policy.onWriteTimeout(getRequestInfo(0), types.consistencies.one, 1, 1, 'BATCH_LOG');
      assert.strictEqual(result.consistency, undefined);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.retry);
      assert.strictEqual(result.useCurrentHost, true);
    });
    it('should rethrow the following times', function () {
      const policy = new RetryPolicy();
      const result = policy.onWriteTimeout(getRequestInfo(1), types.consistencies.one, 1, 1, 'BATCH_LOG');
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.rethrow);
    });
    it('should rethrow when the writeType is not SIMPLE', function () {
      const policy = new RetryPolicy();
      const result = policy.onWriteTimeout(getRequestInfo(0), types.consistencies.one, 3, 2, 'SIMPLE');
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.rethrow);
    });
    it('should rethrow when the writeType is not COUNTER', function () {
      const policy = new RetryPolicy();
      const result = policy.onWriteTimeout(getRequestInfo(0), types.consistencies.one, 3, 3, 'COUNTER');
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.rethrow);
    });
  });
  describe('#onReadTimeout()', function () {
    it('should retry on the same host the first time when received is greater or equal than blockFor', function () {
      const policy = new RetryPolicy();
      const result = policy.onReadTimeout(getRequestInfo(0), types.consistencies.one, 2, 2, false);
      assert.strictEqual(result.consistency, undefined);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.retry);
      assert.strictEqual(result.useCurrentHost, true);
    });
    it('should rethrow the following times', function () {
      const policy = new RetryPolicy();
      const result = policy.onReadTimeout(getRequestInfo(1), types.consistencies.one, 2, 2, false);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.rethrow);
    });
    it('should rethrow when the received is less than blockFor', function () {
      const policy = new RetryPolicy();
      const result = policy.onReadTimeout(getRequestInfo(0), types.consistencies.one, 2, 3, false);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.rethrow);
    });
  });
});
describe('IdempotenceAwareRetryPolicy', function () {
  describe('#onReadTimeout()', function () {
    it('should rely on the child policy to decide', function () {
      let actual = null;
      const childPolicy = {
        onReadTimeout: function (info, consistency, received, blockFor, isDataPresent) {
          actual = {
            info: info, consistency: consistency, received: received, blockFor: blockFor, isDataPresent: isDataPresent
          };
          return { decision: RetryPolicy.retryDecision.retry };
        }
      };
      const policy = new IdempotenceAwareRetryPolicy(childPolicy);
      const result = policy.onReadTimeout(1, 2, 3, 4, 5);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.retry);
      assert.deepEqual(actual, { info: 1, consistency: 2, received: 3, blockFor: 4, isDataPresent: 5 });
    });
  });
  describe('#onRequestError()', function () {
    let actual;
    const childPolicy = {
      onRequestError: function (info, consistency, err) {
        actual = { info: info, consistency: consistency, err: err };
        return { decision: RetryPolicy.retryDecision.retry };
      }
    };
    it('should rethrow for non-idempotent queries', function () {
      actual = null;
      const policy = new IdempotenceAwareRetryPolicy(childPolicy);
      const result = policy.onRequestError({ options: { isIdempotent: false } }, 2, 3);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.rethrow);
      assert.strictEqual(actual, null);
    });
    it('should rely on the child policy when query is idempotent', function () {
      actual = null;
      const policy = new IdempotenceAwareRetryPolicy(childPolicy);
      const result = policy.onRequestError({ options: { isIdempotent: true } }, 2, 3);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.retry);
      assert.deepEqual(actual, { info: { options: { isIdempotent: true } }, consistency: 2, err: 3 });
    });
  });
  describe('#onWriteTimeout()', function () {
    let actual;
    const childPolicy = {
      onWriteTimeout: function (info, consistency, received, blockFor, writeType) {
        actual = { info: info, consistency: consistency, received: received, blockFor: blockFor, writeType: writeType };
        return { decision: RetryPolicy.retryDecision.retry };
      }
    };
    it('should rethrow for non-idempotent queries', function () {
      actual = null;
      const policy = new IdempotenceAwareRetryPolicy(childPolicy);
      const result = policy.onWriteTimeout({ options: { isIdempotent: false } }, 2, 3, 4, 5);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.rethrow);
      assert.strictEqual(actual, null);
    });
    it('should rely on the child policy when query is idempotent', function () {
      actual = null;
      const policy = new IdempotenceAwareRetryPolicy(childPolicy);
      const result = policy.onWriteTimeout({ options: { isIdempotent: true } }, 2, 3, 4, 5);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.retry);
      assert.deepEqual(actual, {
        info: { options: { isIdempotent: true } }, consistency: 2, received: 3, blockFor: 4, writeType: 5
      });
    });
  });
  describe('#onUnavailable()', function () {
    it('should rely on the child policy to decide', function () {
      let actual = null;
      const childPolicy = {
        onUnavailable: function (info, consistency, required, alive) {
          actual = { info: info, consistency: consistency, required: required, alive: alive };
          return { decision: RetryPolicy.retryDecision.retry };
        }
      };
      const policy = new IdempotenceAwareRetryPolicy(childPolicy);
      const result = policy.onUnavailable(10, 20, 30, 40);
      assert.strictEqual(result.decision, RetryPolicy.retryDecision.retry);
      assert.deepEqual(actual, { info: 10, consistency: 20, required: 30, alive: 40 });
    });
  });
});
describe('FallthroughRetryPolicy', function () {
  describe('constructor', function () {
    it('should create instance of RetryPolicy', function () {
      var policy = new FallthroughRetryPolicy();
      helper.assertInstanceOf(policy, RetryPolicy);
    });
  });
  describe('#onReadTimeout()', function () {
    it('should return  rethrow decision', function () {
      var policy = new FallthroughRetryPolicy();
      var decisionInfo = policy.onReadTimeout();
      assert.ok(decisionInfo);
      assert.strictEqual(decisionInfo.decision, RetryPolicy.retryDecision.rethrow);
    });
  });
  describe('#onRequestError()', function () {
    it('should return  rethrow decision', function () {
      var policy = new FallthroughRetryPolicy();
      var decisionInfo = policy.onRequestError();
      assert.ok(decisionInfo);
      assert.strictEqual(decisionInfo.decision, RetryPolicy.retryDecision.rethrow);
    });
  });
  describe('#onUnavailable()', function () {
    it('should return  rethrow decision', function () {
      var policy = new FallthroughRetryPolicy();
      var decisionInfo = policy.onUnavailable();
      assert.ok(decisionInfo);
      assert.strictEqual(decisionInfo.decision, RetryPolicy.retryDecision.rethrow);
    });
  });
  describe('#onWriteTimeout()', function () {
    it('should return  rethrow decision', function () {
      var policy = new FallthroughRetryPolicy();
      var decisionInfo = policy.onWriteTimeout();
      assert.ok(decisionInfo);
      assert.strictEqual(decisionInfo.decision, RetryPolicy.retryDecision.rethrow);
    });
  });
});

function getRequestInfo(nbRetry) {
  return {
    handler: {},
    nbRetry: nbRetry || 0,
    request: {}
  };
}