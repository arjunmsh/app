import assert from 'assert'
import CoinKey from 'coinkey'
import field from 'field'
import proxyquire from 'proxyquire'
import Stealth from 'stealth'
import _ from 'lodash'
import txUtils from '#txutils'
// the fixtures will almost certainly require refactoring
import fixtures from './stealth-payment.fixtures'
var babel = require('../../babel/resolve')

/* global describe, it */
// trinity: mocha

var blkqtStub = {
  '@noCallThru': true // for proxyquire
}

var cryptocoin = _.assign({'@noCallThru': true}, require('../../common/cryptocoin'))

describe('stealth-payment', function () {
  describe('+ prepareSend()', function () {
    it('should prepare', function (done) {
      var f1 = fixtures.prepareSend.valid[0]
      var stubs = {}

      field.set(stubs, '../lib/blkqt:getUnspents', (address, callback) => {
        callback(null, f1.output.utxos)
      })
      stubs['../common/cryptocoin'] = cryptocoin

      var stealthPayment = proxyquire('../stealth-payment', stubs)
      stealthPayment.prepareSend(f1.input, function (err, data) {
        assert.ifError(err)
        assert.deepEqual(data, f1.output)
        done()
      })
    })
  })

  describe('+ createTx()', function () {
    it('should create the tx', function (done) {
      var f1ps = fixtures.prepareSend.valid[0]
      var f1ctx = fixtures.createTx.valid[0]

      var blkqt = _.assign({
        getNewAddress: function (callback) {
          callback(null, f1ctx.standardOutputs[1].address)
        },
        getWif: function (address, callback) {
          callback(null, f1ctx.utxoKeys[0])
        }
      }, blkqtStub)

      var stubs = {
        '../lib/blkqt': blkqt,
        '../common/cryptocoin': _.assign(cryptocoin, {
          create: function () {
            return {
              CoinKey: {
                createRandom: function () {
                  return CoinKey.fromWif(f1ctx.nonce)
                },
                fromWif: CoinKey.fromWif
              }
            }
          }
        }),
        '#txutils': {
          setCurrentTime: function (tx) {
            tx.timestamp = f1ctx.timestamp
          }
        }
      }
      stubs = babel.mapKeys(stubs)

      var stealthPayment = proxyquire('../stealth-payment', stubs)
      stealthPayment.createTx(f1ps.output, function (err, tx) {
        assert.ifError(err)
        var hex = txUtils.serializeToHex(tx)
        assert.strictEqual(f1ctx.txHex, hex)
        done()
      })
    })
  })

  describe('+ checkTx', function () {
    it('should check transaction for OP_RETURN data that matches stealth key', function () {
      var f1chtx = fixtures.checkTx.valid[0]

      var stubs = {
        '../lib/blkqt': blkqtStub,
        '../common/cryptocoin': cryptocoin,
        '#keydb': {
          load: function () {
            return Stealth.fromJSON(JSON.stringify(f1chtx.stealth))
          }
        }
      }
      stubs = babel.mapKeys(stubs)

      var stealthPayment = proxyquire('../stealth-payment', stubs)
      var keyPair = stealthPayment.checkTx(f1chtx.txHex)
      assert.strictEqual(keyPair.privateWif, f1chtx.wif)
    })
  })
})
